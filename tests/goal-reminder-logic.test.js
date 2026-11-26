import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import supabase from '../api/_routes/db-client.js';
import remindersHandler, {
  validateDeadlineFields,
  resetColumnCache,
} from '../api/_routes/reminders.js';
import { isPushReminderTargetCompleted } from '../api/_routes/push-send.js';
import {
  formatLocalYMD,
  parseLocalYMD,
  isValidYMD,
  formatDDMonYYYY,
  validateReminderDeadline,
  getDeadlineFireDateYMD,
  isReminderDeadlineInvalidated,
  isReminderTargetCompleted,
  getReminderActionMode,
  buildReminderDisplayCopy,
} from '../src/lib/goalReminderUtils.js';
import {
  acknowledgeReminderForDate,
  unacknowledgeReminderForDate,
  isReminderAckedForDate,
  hasShownCatchUpToday,
  markCatchUpShownToday,
  executeReminderDone,
  undoReminderDone,
} from '../src/lib/goalReminderActions.js';
import {
  buildNotificationsForReminder,
  getNextFireTime,
  shouldSkipInAppAlarmFire,
} from '../src/lib/nativeNotifications.js';

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

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

function createMockSupabaseFrom(t, {
  userId,
  goals = [],
  milestones = [],
  learningJourneys = [],
  learningTopics = [],
  habits = [],
  reminders = [],
  missingColumns = [],
} = {}) {
  const inserted = [];
  const updated = [];

  t.mock.method(supabase.auth, 'getUser', async () => ({
    data: { user: { id: userId } },
    error: null,
  }));

  t.mock.method(supabase, 'from', (table) => {
    const filters = {};
    let selectedCols = '*';
    let op = 'select';
    let payload = null;
    let rangeFrom = null;
    let rangeTo = null;

    const getTableRows = () => {
      if (table === 'goals') return goals;
      if (table === 'goal_milestones') return milestones;
      if (table === 'learning_journeys') return learningJourneys;
      if (table === 'learning_topics') return learningTopics;
      if (table === 'habits') return habits;
      if (table === 'reminders') return reminders;
      return [];
    };

    const matchRows = () => getTableRows().filter((r) =>
      Object.entries(filters).every(([k, v]) => r[k] === v)
    );

    const checkSchemaError = (colsOrObj) => {
      if (table !== 'reminders' || missingColumns.length === 0) return null;
      const hay = typeof colsOrObj === 'string'
        ? colsOrObj
        : Object.keys(colsOrObj || {}).join(',');
      for (const col of missingColumns) {
        if (hay.includes(col)) {
          return {
            code: col === 'milestone_id' && hay.includes('goal_milestones:') ? 'PGRST200' : 'PGRST204',
            message: `Could not find the '${col}' column/relationship in schema cache`,
          };
        }
      }
      return null;
    };

    const exec = async () => {
      if (op === 'insert') {
        const schemaErr = checkSchemaError(payload);
        if (schemaErr) return { data: null, error: schemaErr };
        const row = { id: `rem-new-${inserted.length + 1}`, ...payload };
        inserted.push(row);
        reminders.push(row);
        return { data: row, error: null };
      }
      if (op === 'update') {
        const schemaErr = checkSchemaError(payload);
        if (schemaErr) return { data: null, error: schemaErr };
        const matches = matchRows();
        if (matches.length === 0) return { data: null, error: null };
        const nextRow = { ...matches[0], ...payload };
        updated.push(nextRow);
        const idx = reminders.indexOf(matches[0]);
        if (idx >= 0) reminders[idx] = nextRow;
        return { data: nextRow, error: null };
      }
      const schemaErr = checkSchemaError(selectedCols);
      if (schemaErr) return { data: null, error: schemaErr };
      let rows = matchRows();
      if (rangeFrom !== null && rangeTo !== null) {
        rows = rows.slice(rangeFrom, rangeTo + 1);
      }
      return { data: rows, error: null };
    };

    const chain = {
      select(cols = '*') {
        selectedCols = cols;
        return chain;
      },
      eq(col, val) {
        filters[col] = val;
        return chain;
      },
      order() { return chain; },
      limit() { return chain; },
      range(from, to) {
        rangeFrom = from;
        rangeTo = to;
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
      async maybeSingle() {
        const res = await exec();
        if (res.error) return res;
        return { data: Array.isArray(res.data) ? (res.data[0] || null) : res.data, error: null };
      },
      async single() {
        const res = await exec();
        if (res.error) return res;
        return { data: Array.isArray(res.data) ? (res.data[0] || null) : res.data, error: null };
      },
      then(resolve, reject) {
        return exec().then(resolve, reject);
      },
    };
    return chain;
  });

  return { inserted, updated };
}

test('API milestone ownership validation, goal_id change clearing, and pre-migration schema fallback', async (t) => {
  const USER_A = 'user-A';
  const USER_B = 'user-B';
  const tomorrow = (() => {
    const d = new Date(Date.now() + 86400000 * 3);
    return formatLocalYMD(d);
  })();
  const inTenDays = formatLocalYMD(new Date(Date.now() + 86400000 * 10));

  const goals = [
    { id: 'g-1', user_id: USER_A, goal_name: 'Run 5K', target_date: inTenDays },
    { id: 'g-2', user_id: USER_A, goal_name: 'Read Book', target_date: inTenDays },
  ];
  const milestones = [
    { id: 'ms-g1', goal_id: 'g-1', user_id: USER_A, title: 'Week 1', completed: false },
    { id: 'ms-g2', goal_id: 'g-2', user_id: USER_A, title: 'Chapter 1', completed: false },
    { id: 'ms-other', goal_id: 'g-foreign', user_id: USER_B, title: 'Secret', completed: false },
  ];
  const reminders = [
    {
      id: 'rem-existing',
      user_id: USER_A,
      target_type: 'goal',
      goal_id: 'g-1',
      milestone_id: 'ms-g1',
      reminder_mode: 'recurring',
      reminder_time: '09:00',
      alerts: ['09:00'],
      days_of_week: ['Mon'],
      notification_status: 'Active',
    },
  ];

  resetColumnCache();
  const { updated } = createMockSupabaseFrom(t, {
    userId: USER_A,
    goals,
    milestones,
    reminders,
  });

  // 1. Foreign user's milestone -> 404
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'POST',
      headers: { authorization: 'Bearer tok', 'x-timezone': 'Asia/Kolkata' },
      query: {},
      body: {
        target_type: 'goal',
        goal_id: 'g-1',
        milestone_id: 'ms-other',
        reminder_mode: 'recurring',
        reminder_time: '09:00',
      },
    }, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /milestone not found/i);
  }

  // 2. Milestone belongs to different goal -> 400
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      query: {},
      body: {
        target_type: 'goal',
        goal_id: 'g-1',
        milestone_id: 'ms-g2',
        reminder_mode: 'recurring',
        reminder_time: '09:00',
      },
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /selected goal/i);
  }

  // 3. Valid milestone -> 201
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      query: {},
      body: {
        target_type: 'goal',
        goal_id: 'g-1',
        milestone_id: 'ms-g1',
        reminder_mode: 'deadline_proximity',
        remind_on_date: tomorrow,
        reminder_time: '09:00',
      },
    }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.milestone_id, 'ms-g1');
    assert.equal(res.body.remind_on_date, tomorrow);
  }

  // 4. Changing goal_id without passing new milestone_id clears stale milestone_id
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'PUT',
      headers: { authorization: 'Bearer tok' },
      query: {},
      body: {
        id: 'rem-existing',
        target_type: 'goal',
        goal_id: 'g-2',
      },
    }, res);
    assert.equal(res.statusCode, 200);
    const lastUpdate = updated[updated.length - 1];
    assert.equal(lastUpdate.goal_id, 'g-2');
    assert.equal(lastUpdate.milestone_id, null);
  }

  // 5. Pre-migration schema fallback when milestone_id and remind_on_date do not exist yet
  resetColumnCache();
  createMockSupabaseFrom(t, {
    userId: USER_A,
    goals,
    milestones,
    reminders: [{ id: 'rem-legacy', user_id: USER_A, target_type: 'goal', goal_id: 'g-1' }],
    missingColumns: ['milestone_id', 'remind_on_date'],
  });
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'GET',
      headers: { authorization: 'Bearer tok' },
      query: {},
    }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body[0].goal_has_milestones, true);
  }
  {
    const res = createMockRes();
    await remindersHandler({
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      query: {},
      body: {
        target_type: 'goal',
        goal_id: 'g-1',
        milestone_id: 'ms-g1',
        reminder_mode: 'deadline_proximity',
        remind_on_date: tomorrow,
        reminder_time: '09:00',
      },
    }, res);
    assert.equal(res.statusCode, 201);
  }
  resetColumnCache();
});

test('remind_on_date and deadline validation (client + API)', () => {
  const todayStr = '2026-05-10';

  // Invalid calendar date rejected
  assert.equal(isValidYMD('2026-02-30'), false);
  assert.equal(parseLocalYMD('2026-02-30'), null);
  {
    const v = validateReminderDeadline({
      reminderMode: 'deadline_proximity',
      remindOnDate: '2026-02-30',
      useCustomDate: true,
      targetDate: '2026-05-20',
      todayStr,
    });
    assert.equal(v.valid, false);
  }

  // Past date rejected
  {
    const v = validateReminderDeadline({
      reminderMode: 'deadline_proximity',
      remindOnDate: '2026-05-09',
      useCustomDate: true,
      targetDate: '2026-05-20',
      todayStr,
    });
    assert.equal(v.valid, false);
    assert.match(v.error, /past/i);
  }

  // Date after goal target_date rejected with DD Mon YYYY format
  {
    const v = validateReminderDeadline({
      reminderMode: 'deadline_proximity',
      remindOnDate: '2026-05-25',
      useCustomDate: true,
      targetDate: '2026-05-20',
      todayStr,
    });
    assert.equal(v.valid, false);
    assert.equal(v.error, `Pick a date on or before the deadline (${formatDDMonYYYY('2026-05-20')})`);
  }

  // API validator returns same exact message for date after target_date
  {
    const err = validateDeadlineFields({
      reminderMode: 'deadline_proximity',
      remindOnDate: '2026-05-25',
      targetDate: '2026-05-20',
      todayLocal: todayStr,
    });
    assert.equal(err.valid, false);
    assert.equal(err.status, 400);
    assert.equal(err.error, 'Pick a date on or before the deadline (20 May 2026)');
  }

  // Deadline chip selected on a goal without target_date rejected
  {
    const v = validateReminderDeadline({
      reminderMode: 'deadline_proximity',
      remindOnDate: null,
      useCustomDate: false,
      targetDate: null,
      todayStr,
    });
    assert.equal(v.valid, false);
    assert.equal(
      v.error,
      'This goal has no deadline yet. Pick a date for the reminder or switch to Recurring Routine.'
    );
  }

  // Picking custom date on a goal without target_date IS allowed
  {
    const v = validateReminderDeadline({
      reminderMode: 'deadline_proximity',
      remindOnDate: '2026-05-12',
      useCustomDate: true,
      targetDate: null,
      todayStr,
    });
    assert.equal(v.valid, true);
  }

  // Deadline moved earlier than remind_on_date triggers warning helper
  assert.equal(
    isReminderDeadlineInvalidated(
      {
        reminder_mode: 'deadline_proximity',
        notification_status: 'Active',
        remind_on_date: '2026-05-18',
      },
      '2026-05-15',
      todayStr
    ),
    true
  );
});

test('Scheduler fires on remind_on_date (ignoring days_before_deadline) and skips completed milestones/targets', () => {
  const reminderWithCustomDate = {
    id: 'rem-custom',
    target_type: 'goal',
    goal_id: 'g-1',
    goal_name: 'Run 5K',
    milestone_id: 'ms-1',
    milestone_title: 'Week 1',
    reminder_mode: 'deadline_proximity',
    remind_on_date: '2026-05-15',
    days_before_deadline: 7,
    target_date: '2026-05-20', // 7 days before would be May 13, but remind_on_date overrides to May 15
    reminder_time: '09:30',
    alerts: ['09:30'],
    notification_status: 'Active',
  };

  assert.equal(getDeadlineFireDateYMD(reminderWithCustomDate), '2026-05-15');

  // Now = May 12 2026 -> next fire must be May 15 at 09:30, NOT May 13
  const nowMay12 = new Date(2026, 4, 12, 8, 0, 0);
  const next = getNextFireTime(reminderWithCustomDate, nowMay12);
  assert.ok(next instanceof Date);
  assert.equal(formatLocalYMD(next), '2026-05-15');
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 30);

  const built = buildNotificationsForReminder(reminderWithCustomDate, '', { now: nowMay12 });
  assert.equal(built.length, 1);
  assert.equal(formatLocalYMD(built[0].schedule.at), '2026-05-15');
  assert.match(built[0].title, /Week 1/);

  // Past remind_on_date -> 0 notifications
  const nowMay16 = new Date(2026, 4, 16, 10, 0, 0);
  assert.equal(buildNotificationsForReminder(reminderWithCustomDate, '', { now: nowMay16 }).length, 0);

  // Completed milestone -> skipped across nativeNotifications, shouldSkipInAppAlarmFire, and push-send
  assert.equal(
    buildNotificationsForReminder(reminderWithCustomDate, '', {
      now: nowMay12,
      completedMilestoneIds: new Set(['ms-1']),
    }).length,
    0
  );
  assert.deepEqual(
    shouldSkipInAppAlarmFire(reminderWithCustomDate, {
      completedMilestones: new Set(['ms-1']),
    }),
    { skip: true, reason: 'completed_milestone' }
  );
  assert.equal(
    isPushReminderTargetCompleted({
      ...reminderWithCustomDate,
      goal_milestones: { completed: true },
    }),
    true
  );
  assert.equal(
    isPushReminderTargetCompleted({
      target_type: 'learning_topic',
      topic_id: 'tp-1',
      learning_topics: { status: 'Completed' },
    }),
    true
  );
});

test('executeReminderDone + undoReminderDone for milestone, topic, failure guard, and offline APK queue', async () => {
  const storage = createMemoryStorage();
  const session = { access_token: 'tok', user: { id: 'user-1' } };
  const reminder = {
    id: 'rem-ms-1',
    target_type: 'goal',
    goal_id: 'goal-1',
    milestone_id: 'ms-1',
    reminder_mode: 'deadline_proximity',
    notification_status: 'Active',
  };

  // 1. Happy path online -> completes milestone + marks reminder Done + returns Undo
  {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({}) };
    };
    const res = await executeReminderDone({
      reminder,
      session,
      isNativePlatform: false,
      isOnline: true,
      fetchImpl,
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(res.ok, true);
    assert.equal(res.toast.message, 'Milestone done');
    assert.equal(res.toast.actionLabel, 'Undo');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, '/api/milestones');
    assert.deepEqual(calls[0].body, { id: 'ms-1', completed: true });
    assert.equal(calls[1].url, '/api/reminders');
    assert.deepEqual(calls[1].body, { id: 'rem-ms-1', notification_status: 'Done' });
    assert.equal(isReminderAckedForDate('rem-ms-1', '2026-05-10', storage), true);

    // Undo reverses both and unacknowledges date
    const undoCalls = [];
    const undoRes = await undoReminderDone({
      undoData: res.undoData,
      session,
      fetchImpl: async (url, opts) => {
        undoCalls.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({}) };
      },
      storage,
    });
    assert.equal(undoRes.ok, true);
    assert.deepEqual(undoCalls[0].body, { id: 'ms-1', completed: false });
    assert.deepEqual(undoCalls[1].body, { id: 'rem-ms-1', notification_status: 'Active' });
    assert.equal(isReminderAckedForDate('rem-ms-1', '2026-05-10', storage), false);
  }

  // 2. If PUT /api/milestones fails, reminder is NEVER set to Done
  {
    const calls = [];
    const res = await executeReminderDone({
      reminder,
      session,
      isNativePlatform: false,
      isOnline: true,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: false, json: async () => ({ error: 'DB fail' }) };
      },
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(res.ok, false);
    assert.equal(calls.length, 1);
  }

  // 3. Offline on Web -> returns error, never claims "Milestone done"
  {
    const res = await executeReminderDone({
      reminder,
      session,
      isNativePlatform: false,
      isOnline: false,
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(res.ok, false);
  }

  // 4. Offline on native APK -> queues UPDATE_MILESTONE & UPDATE_REMINDER, says "Saved offline. Will sync when online."
  {
    const queued = [];
    const res = await executeReminderDone({
      reminder,
      session,
      isNativePlatform: true,
      isOnline: false,
      enqueueAction: async (uid, actionType, payload) => {
        queued.push({ uid, actionType, payload });
        return 'queue-id-1';
      },
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(res.ok, true);
    assert.equal(res.queued, true);
    assert.equal(res.toast.message, 'Saved offline. Will sync when online.');
    assert.deepEqual(queued.map((q) => q.actionType), ['UPDATE_MILESTONE', 'UPDATE_REMINDER']);
  }

  // 5. Learning topic Done -> completes topic + marks deadline reminder Done
  {
    const calls = [];
    const topicReminder = {
      id: 'rem-tp-1',
      target_type: 'learning_topic',
      journey_id: 'j-1',
      topic_id: 'tp-1',
      reminder_mode: 'deadline_proximity',
      notification_status: 'Active',
    };
    const res = await executeReminderDone({
      reminder: topicReminder,
      session,
      isNativePlatform: false,
      isOnline: true,
      fetchImpl: async (url, opts) => {
        calls.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({}) };
      },
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(res.ok, true);
    assert.equal(res.toast.message, 'Topic completed');
    assert.equal(calls[0].url, '/api/learning?action=update_topic');
    assert.deepEqual(calls[0].body, { id: 'tp-1', status: 'Completed' });
    assert.equal(calls[1].url, '/api/reminders');
  }
});

test('Goal without milestones uses Open + Snooze (SW, native, utils) and Whole goal with milestones acknowledges day', () => {
  const goalNoMs = {
    id: 'rem-g-noms',
    target_type: 'goal',
    goal_id: 'g-noms',
    goal_name: 'Buy Passport',
    goal_has_milestones: false,
    reminder_mode: 'recurring',
    reminder_time: '10:00',
    alerts: ['10:00'],
    days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    notification_status: 'Active',
  };

  assert.equal(getReminderActionMode(goalNoMs, false), 'confirm_goal');

  const nativeNoMs = buildNotificationsForReminder(goalNoMs, '', { now: new Date(2026, 4, 10, 8, 0) });
  assert.ok(nativeNoMs.length > 0);
  assert.equal(nativeNoMs[0].actionTypeId, 'GOAL_OPEN_REMINDER_ACTIONS');
  assert.equal(nativeNoMs[0].extra.goalId, 'g-noms');
  assert.equal(nativeNoMs[0].extra.hasMilestones, false);

  // Verify Service Worker push payload emits Open + Snooze 10 min (NOT Mark Done) for goal without milestones
  const swPath = path.resolve(process.cwd(), 'public/sw.js');
  const swCode = fs.readFileSync(swPath, 'utf8');
  const swListeners = {};
  const shownNotifications = [];
  const swSandbox = {
    self: {
      location: { origin: 'http://localhost' },
      addEventListener(type, fn) { swListeners[type] = fn; },
      skipWaiting() {},
      clients: { claim() {}, matchAll: async () => [] },
      registration: {
        showNotification: async (title, opts) => {
          shownNotifications.push({ title, opts });
        },
      },
    },
    caches: {
      open: async () => ({ addAll: async () => {}, match: async () => null, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    URL,
    Response,
    Date,
    setTimeout,
    clearTimeout,
    console,
    Promise,
  };
  swSandbox.clients = swSandbox.self.clients;
  swSandbox.registration = swSandbox.self.registration;
  vm.runInNewContext(swCode, swSandbox);

  let waitPromise = Promise.resolve();
  swListeners.push({
    data: {
      json: () => ({
        title: 'Goal',
        body: 'Check in',
        targetType: 'goal',
        goalId: 'g-noms',
        reminderId: 'rem-g-noms',
        hasMilestones: false,
      }),
    },
    waitUntil(p) { waitPromise = p; },
  });

  return waitPromise.then(async () => {
    assert.equal(shownNotifications.length, 1);
    assert.deepEqual(
      Array.from(shownNotifications[0].opts.actions, (a) => String(a.action)),
      ['open', 'snooze']
    );

    // Whole goal WITH milestones -> ack_goal_day opens /goals and stops repeat rings today
    const storage = createMemoryStorage();
    const wholeGoalWithMs = {
      ...goalNoMs,
      id: 'rem-g-withms',
      goal_has_milestones: true,
    };
    assert.equal(getReminderActionMode(wholeGoalWithMs, true), 'ack_goal_day');

    const ackRes = await executeReminderDone({
      reminder: wholeGoalWithMs,
      hasMilestones: true,
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(ackRes.ok, true);
    assert.equal(ackRes.navigateTo, '/goals');
    assert.equal(isReminderAckedForDate('rem-g-withms', '2026-05-10', storage), true);
    assert.equal(
      shouldSkipInAppAlarmFire(wholeGoalWithMs, {
        ackedReminderDates: new Set(['rem-g-withms:2026-05-10']),
        todayYMD: '2026-05-10',
      }).skip,
      true
    );
    // Next day it does NOT stay skipped
    assert.equal(
      shouldSkipInAppAlarmFire(wholeGoalWithMs, {
        ackedReminderDates: new Set(['rem-g-withms:2026-05-10']),
        todayYMD: '2026-05-11',
      }).skip,
      false
    );

    // Explicit goal confirmation completes goal
    const confirmGoalRes = await executeReminderDone({
      reminder: goalNoMs,
      modeOverride: 'complete_goal',
      session: { access_token: 'tok', user: { id: 'u1' } },
      isOnline: true,
      fetchImpl: async (url, opts) => {
        assert.equal(url, '/api/goals');
        assert.deepEqual(JSON.parse(opts.body), { id: 'g-noms', status: 'Completed' });
        return { ok: true, json: async () => ({}) };
      },
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(confirmGoalRes.ok, true);

    // Manual acknowledge & unacknowledge date helpers
    acknowledgeReminderForDate('rem-manual', '2026-05-10', storage);
    assert.equal(isReminderAckedForDate('rem-manual', '2026-05-10', storage), true);
    unacknowledgeReminderForDate('rem-manual', '2026-05-10', storage);
    assert.equal(isReminderAckedForDate('rem-manual', '2026-05-10', storage), false);

    // Whole learning journey uses confirm_journey and explicit confirmation completes it
    const wholeJourney = {
      id: 'rem-j-1',
      target_type: 'learning_journey',
      journey_id: 'j-1',
      notification_status: 'Active',
    };
    assert.equal(getReminderActionMode(wholeJourney), 'confirm_journey');
    const confirmJourneyRes = await executeReminderDone({
      reminder: wholeJourney,
      modeOverride: 'complete_journey',
      session: { access_token: 'tok', user: { id: 'u1' } },
      isOnline: true,
      fetchImpl: async (url, opts) => {
        assert.equal(url, '/api/learning?action=update_journey');
        assert.deepEqual(JSON.parse(opts.body), { id: 'j-1', status: 'Completed' });
        return { ok: true, json: async () => ({}) };
      },
      storage,
      todayYMD: '2026-05-10',
    });
    assert.equal(confirmJourneyRes.ok, true);

    // Daily catch-up dedupe per reminder per date
    assert.equal(hasShownCatchUpToday('rem-c1', '2026-05-10', storage), false);
    markCatchUpShownToday('rem-c1', '2026-05-10', storage);
    assert.equal(hasShownCatchUpToday('rem-c1', '2026-05-10', storage), true);
    assert.equal(hasShownCatchUpToday('rem-c1', '2026-05-11', storage), false);

    // Copy helper formats Goal + Milestone and Learning Topic cleanly
    const msCopy = buildReminderDisplayCopy({
      target_type: 'goal',
      goals: { goal_name: 'Run 5K' },
      milestone_id: 'ms-1',
      goal_milestones: { title: 'Week 1' },
    });
    assert.match(msCopy.title, /Run 5K.*Week 1/);

    // Non-midnight local-date formatting (local vs UTC stability)
    const lateEvening = new Date(2026, 4, 10, 23, 45, 0);
    assert.equal(formatLocalYMD(lateEvening), '2026-05-10');
  });
});
