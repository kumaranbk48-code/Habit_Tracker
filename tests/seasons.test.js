import test from 'node:test';
import assert from 'node:assert/strict';
import supabase from '../api/_routes/db-client.js';
import seasonsHandler from '../api/_routes/seasons.js';

function createMockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    end() { return this; },
  };
}

function addDaysYMD(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function setupSeasonsMock(t, initialState) {
  const db = {
    seasons: (initialState.seasons || []).map(r => ({ ...r })),
    season_habits: (initialState.season_habits || []).map(r => ({ ...r })),
    habits: (initialState.habits || []).map(r => ({ ...r })),
    habit_tracking: (initialState.habit_tracking || []).map(r => ({ ...r })),
  };
  let seq = 1;

  t.mock.method(supabase.auth, 'getUser', async () => ({
    data: { user: { id: initialState.userId, user_metadata: { timezone: 'UTC' } } },
    error: null,
  }));

  t.mock.method(supabase, 'from', (table) => {
    const eqFilters = {};
    const inFilters = {};
    const gteFilters = {};
    const lteFilters = {};
    let op = 'select';
    let payload = null;
    let selectedCols = '*';
    let rangeBounds = null;

    const getRows = () => db[table] || [];

    const matches = (row) => {
      for (const [k, v] of Object.entries(eqFilters)) {
        if (row[k] !== v) return false;
      }
      for (const [k, vals] of Object.entries(inFilters)) {
        if (!vals.includes(row[k])) return false;
      }
      for (const [k, v] of Object.entries(gteFilters)) {
        if (row[k] < v) return false;
      }
      for (const [k, v] of Object.entries(lteFilters)) {
        if (row[k] > v) return false;
      }
      return true;
    };

    const exec = async () => {
      const tableRows = getRows();
      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted = items.map(item => ({
          id: item.id || `${table}-${seq++}`,
          created_at: new Date().toISOString(),
          ...item,
        }));
        tableRows.push(...inserted);
        return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
      }

      if (op === 'update') {
        const updated = [];
        for (const row of tableRows) {
          if (matches(row)) {
            Object.assign(row, payload);
            updated.push({ ...row });
          }
        }
        return { data: updated, error: null };
      }

      if (op === 'delete') {
        const deleted = [];
        for (let i = tableRows.length - 1; i >= 0; i--) {
          if (matches(tableRows[i])) {
            deleted.push(tableRows.splice(i, 1)[0]);
          }
        }
        return { data: deleted, error: null };
      }

      let result = tableRows.filter(matches).map(r => {
        if (table === 'season_habits' && selectedCols.includes('habits(')) {
          const habit = db.habits.find(h => h.id === r.habit_id) || null;
          return { ...r, habits: habit ? { ...habit } : null };
        }
        return { ...r };
      });
      if (rangeBounds) {
        result = result.slice(rangeBounds[0], rangeBounds[1] + 1);
      }
      return { data: result, error: null };
    };

    const chain = {
      select(cols = '*') {
        selectedCols = cols;
        return chain;
      },
      eq(col, val) {
        eqFilters[col] = val;
        return chain;
      },
      in(col, vals) {
        inFilters[col] = Array.isArray(vals) ? vals : [];
        return chain;
      },
      gte(col, val) {
        gteFilters[col] = val;
        return chain;
      },
      lte(col, val) {
        lteFilters[col] = val;
        return chain;
      },
      order() { return chain; },
      range(from, to) {
        rangeBounds = [from, to];
        return chain;
      },
      insert(data) {
        op = 'insert';
        payload = data;
        return chain;
      },
      update(data) {
        op = 'update';
        payload = data;
        return chain;
      },
      delete() {
        op = 'delete';
        return chain;
      },
      async maybeSingle() {
        const res = await exec();
        const first = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
        return { data: first, error: res.error };
      },
      async single() {
        const res = await exec();
        const first = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
        return { data: first, error: res.error };
      },
      then(resolve, reject) {
        return exec().then(resolve, reject);
      },
    };
    return chain;
  });

  return db;
}

test('Seasons lifecycle: auto-expire resumes only habits of expired season while preserving manual/other pauses', async (t) => {
  const USER_ID = 'user-season-1';
  const todayUTC = new Date().toISOString().split('T')[0];
  const pastStart = addDaysYMD(todayUTC, -20);
  const pastEnd = addDaysYMD(todayUTC, -1);
  const futureStart = addDaysYMD(todayUTC, -2);
  const futureEnd = addDaysYMD(todayUTC, 10);

  const db = setupSeasonsMock(t, {
    userId: USER_ID,
    seasons: [
      {
        id: 'season-expired',
        user_id: USER_ID,
        name: 'Winter Focus',
        start_date: pastStart,
        end_date: pastEnd,
        status: 'active',
      },
      {
        id: 'season-other',
        user_id: USER_ID,
        name: 'Concurrent Active',
        start_date: futureStart,
        end_date: futureEnd,
        status: 'active',
      },
    ],
    habits: [
      { id: 'h-exp-active', user_id: USER_ID, habit_name: 'H1', status: 'active', season_id: 'season-expired' },
      { id: 'h-exp-paused', user_id: USER_ID, habit_name: 'H2', status: 'paused', season_id: 'season-expired' },
      { id: 'h-manual-paused', user_id: USER_ID, habit_name: 'H3', status: 'paused', season_id: null },
      { id: 'h-other-paused', user_id: USER_ID, habit_name: 'H4', status: 'paused', season_id: 'season-other' },
    ],
  });

  const res = createMockRes();
  await seasonsHandler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200);
  const expiredSeasonRow = db.seasons.find(s => s.id === 'season-expired');
  assert.equal(expiredSeasonRow.status, 'ended');

  // Habits linked to the expired season must now be active with season_id cleared
  assert.deepEqual(
    {
      status: db.habits.find(h => h.id === 'h-exp-active').status,
      season_id: db.habits.find(h => h.id === 'h-exp-active').season_id,
    },
    { status: 'active', season_id: null }
  );
  assert.deepEqual(
    {
      status: db.habits.find(h => h.id === 'h-exp-paused').status,
      season_id: db.habits.find(h => h.id === 'h-exp-paused').season_id,
    },
    { status: 'active', season_id: null }
  );

  // Manually paused habit and habit paused for another season MUST NOT be resumed
  assert.deepEqual(
    {
      status: db.habits.find(h => h.id === 'h-manual-paused').status,
      season_id: db.habits.find(h => h.id === 'h-manual-paused').season_id,
    },
    { status: 'paused', season_id: null }
  );
  assert.deepEqual(
    {
      status: db.habits.find(h => h.id === 'h-other-paused').status,
      season_id: db.habits.find(h => h.id === 'h-other-paused').season_id,
    },
    { status: 'paused', season_id: 'season-other' }
  );
});

test('Seasons edit rejects start_date > end_date and reactivate rejects expired seasons (400)', async (t) => {
  const USER_ID = 'user-season-2';
  const todayUTC = new Date().toISOString().split('T')[0];
  const pastStart = addDaysYMD(todayUTC, -14);
  const pastEnd = addDaysYMD(todayUTC, -2);
  const futureStart = addDaysYMD(todayUTC, 0);
  const futureEnd = addDaysYMD(todayUTC, 30);

  const db = setupSeasonsMock(t, {
    userId: USER_ID,
    seasons: [
      {
        id: 'season-edit',
        user_id: USER_ID,
        name: 'Editable Season',
        start_date: futureStart,
        end_date: futureEnd,
        status: 'active',
      },
      {
        id: 'season-ended-past',
        user_id: USER_ID,
        name: 'Expired Ended Season',
        start_date: pastStart,
        end_date: pastEnd,
        status: 'ended',
      },
    ],
  });

  // 1. Edit with start_date > end_date -> 400
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: {
        action: 'edit',
        id: 'season-edit',
        start_date: addDaysYMD(futureEnd, 2),
        end_date: futureEnd,
      },
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Start date cannot be after end date');
  }

  // 2. Edit passing only end_date earlier than existing start_date -> 400
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: {
        action: 'edit',
        id: 'season-edit',
        end_date: addDaysYMD(futureStart, -1),
      },
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Start date cannot be after end date');
  }

  // 3. Reactivating an already-expired season -> 400 and remains ended
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: {
        action: 'reactivate',
        id: 'season-ended-past',
      },
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /end date has passed/i);
    assert.equal(db.seasons.find(s => s.id === 'season-ended-past').status, 'ended');
  }
});

test('Seasons full flow: create 2/4 habits, end resumes all 4, reactivate reapplies selection, delete resumes, review UTC bestStreak', async (t) => {
  const USER_ID = 'user-season-3';
  const todayUTC = new Date().toISOString().split('T')[0];
  const start = addDaysYMD(todayUTC, -4);
  const end = addDaysYMD(todayUTC, 20);

  const db = setupSeasonsMock(t, {
    userId: USER_ID,
    habits: [
      { id: 'h1', user_id: USER_ID, habit_name: 'Read', status: 'active', season_id: null },
      { id: 'h2', user_id: USER_ID, habit_name: 'Run', status: 'active', season_id: null },
      { id: 'h3', user_id: USER_ID, habit_name: 'Draw', status: 'active', season_id: null },
      { id: 'h4', user_id: USER_ID, habit_name: 'Cook', status: 'active', season_id: null },
      { id: 'h-manual', user_id: USER_ID, habit_name: 'Manual Pause', status: 'paused', season_id: null },
    ],
    habit_tracking: [
      { id: 't1', user_id: USER_ID, habit_id: 'h1', completion_date: addDaysYMD(todayUTC, -4), status: true },
      { id: 't2', user_id: USER_ID, habit_id: 'h1', completion_date: addDaysYMD(todayUTC, -3), status: true },
      { id: 't3', user_id: USER_ID, habit_id: 'h1', completion_date: addDaysYMD(todayUTC, -2), status: true },
      { id: 't4', user_id: USER_ID, habit_id: 'h2', completion_date: todayUTC, status: true },
    ],
  });

  // 1. Create season picking h1 and h2 out of 4 active habits
  let createdId;
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: {
        name: 'Spring Sprint',
        start_date: start,
        end_date: end,
        active_habit_ids: ['h1', 'h2'],
      },
    }, res);
    assert.equal(res.statusCode, 201);
    createdId = res.body.season.id;
    assert.equal(db.habits.find(h => h.id === 'h1').status, 'active');
    assert.equal(db.habits.find(h => h.id === 'h2').status, 'active');
    assert.equal(db.habits.find(h => h.id === 'h3').status, 'paused');
    assert.equal(db.habits.find(h => h.id === 'h4').status, 'paused');
    assert.equal(db.habits.find(h => h.id === 'h3').season_id, createdId);
    assert.equal(db.habits.find(h => h.id === 'h-manual').status, 'paused');
    assert.equal(db.habits.find(h => h.id === 'h-manual').season_id, null);
  }

  // 2. End season -> all 4 habits become active again (manual pause preserved)
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: { action: 'end_season', id: createdId },
    }, res);
    assert.equal(res.statusCode, 200);
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      assert.equal(db.habits.find(h => h.id === id).status, 'active');
      assert.equal(db.habits.find(h => h.id === id).season_id, null);
    }
    assert.equal(db.habits.find(h => h.id === 'h-manual').status, 'paused');
  }

  // 3. Reactivate non-expired season -> reapplies its season_habits selection ([h1, h2] active, h3/h4 paused)
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: { action: 'reactivate', id: createdId },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.season.status, 'active');
    assert.equal(db.habits.find(h => h.id === 'h1').status, 'active');
    assert.equal(db.habits.find(h => h.id === 'h2').status, 'active');
    assert.equal(db.habits.find(h => h.id === 'h3').status, 'paused');
    assert.equal(db.habits.find(h => h.id === 'h4').status, 'paused');
    assert.equal(db.habits.find(h => h.id === 'h-manual').status, 'paused');
  }

  // 4. Review calculates exact UTC-safe bestStreak (3 consecutive days: today-4, today-3, today-2)
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      query: { action: 'review', id: createdId },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.bestStreak, 3);
    assert.equal(res.body.daysCompleted, 4);
  }

  // 5. Delete season -> resumes all 4 habits (manual pause untouched) and removes season
  {
    const res = createMockRes();
    await seasonsHandler({
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      body: { id: createdId },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(db.seasons.length, 0);
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      assert.equal(db.habits.find(h => h.id === id).status, 'active');
      assert.equal(db.habits.find(h => h.id === id).season_id, null);
    }
    assert.equal(db.habits.find(h => h.id === 'h-manual').status, 'paused');
  }
});
