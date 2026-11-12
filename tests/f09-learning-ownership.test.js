import test from 'node:test';
import assert from 'node:assert/strict';
import supabase from '../api/_routes/db-client.js';
import learningHandler from '../api/_routes/learning.js';

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

test('F-09 connect_habit enforces journey and habit ownership', async (t) => {
  const CURRENT_USER = 'user-A-123';
  const OTHER_USER = 'user-B-999';

  const dbData = {
    learning_journeys: [{ id: 'j-own', user_id: CURRENT_USER }, { id: 'j-other', user_id: OTHER_USER }],
    habits: [{ id: 'h-own', user_id: CURRENT_USER }, { id: 'h-other', user_id: OTHER_USER }],
  };

  t.mock.method(supabase.auth, 'getUser', async () => ({
    data: { user: { id: CURRENT_USER } },
    error: null,
  }));

  t.mock.method(supabase, 'from', (table) => {
    const filters = {};
    const chain = {
      select() { return chain; },
      eq(col, val) { filters[col] = val; return chain; },
      async maybeSingle() {
        const rows = dbData[table] || [];
        const match = rows.find((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v)
        );
        return { data: match || null, error: null };
      },
      insert(payload) {
        return {
          select() {
            return {
              async single() {
                return { data: { id: 'conn-1', ...payload }, error: null };
              },
            };
          },
        };
      },
    };
    return chain;
  });

  // 1. Journey belongs to another user -> 404
  {
    const res = createMockRes();
    await learningHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      query: { action: 'connect_habit' },
      body: { journey_id: 'j-other', habit_id: 'h-own' },
    }, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /journey not found/i);
  }

  // 2. Habit belongs to another user -> 404
  {
    const res = createMockRes();
    await learningHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      query: { action: 'connect_habit' },
      body: { journey_id: 'j-own', habit_id: 'h-other' },
    }, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /habit not found/i);
  }

  // 3. Both belong to current user -> 201 success
  {
    const res = createMockRes();
    await learningHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      query: { action: 'connect_habit' },
      body: { journey_id: 'j-own', habit_id: 'h-own' },
    }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, 'conn-1');
    assert.equal(res.body.user_id, CURRENT_USER);
  }
});

