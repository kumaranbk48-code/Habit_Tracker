import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processPendingAlarmActions,
  shouldSkipInAppAlarmFire,
  recordNativeHandledAction,
  getHandledNativeState,
  clearNativeHandledHabitDate,
} from '../src/lib/nativeNotifications.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('Pending Native Alarm Actions & In-App Skip Guard', async (t) => {
  const session = {
    access_token: 'tok-test',
    user: { id: 'user-1' },
  };

  await t.test('online success posts to /api/tracking (with quantity target) and acks action', async () => {
    const storage = createMemoryStorage();
    const pending = [
      {
        id: 'complete_h-qty_2026-11-26',
        type: 'complete',
        habitId: 'h-qty',
        reminderId: 'r-1',
        targetType: 'habit',
        date: '2026-11-26',
        occurrenceMinute: '08:00',
        timestamp: 1000,
      },
    ];
    const fetchCalls = [];
    const ackCalls = [];
    const enqueueCalls = [];

    const result = await processPendingAlarmActions(session, {
      isNativeOverride: true,
      skipCacheLookup: true,
      skipCacheUpdate: true,
      storage,
      habits: [{ id: 'h-qty', tracking_type: 'quantity', target_quantity: 5 }],
      getOnlineStatusImpl: () => true,
      scheduler: {
        getPendingAlarmActions: async () => ({ actions: pending }),
        ackPendingAlarmActions: async (payload) => { ackCalls.push(payload); },
      },
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ status: true }) };
      },
      enqueueAction: async (...args) => { enqueueCalls.push(args); return 'q-1'; },
    });

    assert.equal(result.processed, 1);
    assert.deepEqual(result.completedHabitIds, ['h-qty']);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/api/tracking');
    assert.deepEqual(fetchCalls[0].body, {
      habit_id: 'h-qty',
      completion_date: '2026-11-26',
      status: true,
      action: 'complete',
      amount: 5,
    });
    assert.equal(enqueueCalls.length, 0);
    assert.equal(ackCalls.length, 1);
    assert.deepEqual(ackCalls[0].ids, ['complete_h-qty_2026-11-26']);
    clearNativeHandledHabitDate('h-qty', '2026-11-26', storage);
  });

  await t.test('offline / network failure enqueues TRACK_HABIT and acks only after queue succeeds', async () => {
    const storage = createMemoryStorage();
    const pending = [
      {
        id: 'complete_h-off_2026-11-26',
        type: 'complete',
        habitId: 'h-off',
        reminderId: 'r-2',
        targetType: 'habit',
        date: '2026-11-26',
        occurrenceMinute: '09:00',
        timestamp: 2000,
      },
    ];
    const ackCalls = [];
    const enqueueCalls = [];

    const result = await processPendingAlarmActions(session, {
      isNativeOverride: true,
      skipCacheLookup: true,
      skipCacheUpdate: true,
      storage,
      habits: [{ id: 'h-off', tracking_type: 'boolean' }],
      getOnlineStatusImpl: () => false,
      scheduler: {
        getPendingAlarmActions: async () => ({ actions: pending }),
        ackPendingAlarmActions: async (payload) => { ackCalls.push(payload); },
      },
      enqueueAction: async (userId, actionType, body) => {
        enqueueCalls.push({ userId, actionType, body });
        return 'queued-id-1';
      },
    });

    assert.equal(result.processed, 1);
    assert.equal(enqueueCalls.length, 1);
    assert.equal(enqueueCalls[0].actionType, 'TRACK_HABIT');
    assert.equal(enqueueCalls[0].body.habit_id, 'h-off');
    assert.equal(enqueueCalls[0].body.status, true);
    assert.equal(ackCalls.length, 1);
    assert.deepEqual(ackCalls[0].ids, ['complete_h-off_2026-11-26']);
    clearNativeHandledHabitDate('h-off', '2026-11-26', storage);
  });

  await t.test('HTTP already-completed error is treated as success and acked', async () => {
    const storage = createMemoryStorage();
    const pending = [
      {
        id: 'complete_h-dup_2026-11-26',
        type: 'complete',
        habitId: 'h-dup',
        reminderId: 'r-3',
        targetType: 'habit',
        date: '2026-11-26',
        occurrenceMinute: '10:00',
        timestamp: 3000,
      },
    ];
    const ackCalls = [];

    const result = await processPendingAlarmActions(session, {
      isNativeOverride: true,
      skipCacheLookup: true,
      skipCacheUpdate: true,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        getPendingAlarmActions: async () => ({ actions: pending }),
        ackPendingAlarmActions: async (payload) => { ackCalls.push(payload); },
      },
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Habit already completed for today' }),
      }),
      enqueueAction: async () => null,
    });

    assert.equal(result.processed, 1);
    assert.equal(ackCalls.length, 1);
    clearNativeHandledHabitDate('h-dup', '2026-11-26', storage);
  });

  await t.test('does NOT ack if both network POST and offline enqueue fail', async () => {
    const storage = createMemoryStorage();
    const pending = [
      {
        id: 'complete_h-fail_2026-11-26',
        type: 'complete',
        habitId: 'h-fail',
        reminderId: 'r-4',
        targetType: 'habit',
        date: '2026-11-26',
        occurrenceMinute: '11:00',
        timestamp: 4000,
      },
    ];
    const ackCalls = [];

    const result = await processPendingAlarmActions(session, {
      isNativeOverride: true,
      skipCacheLookup: true,
      skipCacheUpdate: true,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        getPendingAlarmActions: async () => ({ actions: pending }),
        ackPendingAlarmActions: async (payload) => { ackCalls.push(payload); },
      },
      fetchImpl: async () => { throw new Error('Network down'); },
      enqueueAction: async () => null, // enqueue also fails
    });

    assert.equal(result.processed, 0);
    assert.equal(ackCalls.length, 0, 'Must NOT ack when persistence failed');
    clearNativeHandledHabitDate('h-fail', '2026-11-26', storage);
  });

  await t.test('non-native (web) platform is a no-op', async () => {
    let called = false;
    const result = await processPendingAlarmActions(session, {
      isNativeOverride: false,
      scheduler: {
        getPendingAlarmActions: async () => { called = true; return { actions: [] }; },
      },
    });
    assert.equal(called, false);
    assert.equal(result.processed, 0);
  });

  await t.test('ticker skip rules: completedHabits, handledHabitDates, recent snooze <10m, persisted firedKey', () => {
    const storage = createMemoryStorage();
    const today = '2026-11-26';
    const rem = { id: 'r-10', target_type: 'habit', habit_id: 'h-10' };
    const baseMs = new Date(2026, 10, 26, 8, 5, 0, 0).getTime();

    // Clean state -> does not skip
    assert.equal(
      shouldSkipInAppAlarmFire(rem, { todayYMD: today, currentTime: '08:05', nowMs: baseMs }).skip,
      false
    );

    // (a) Completed habit
    assert.equal(
      shouldSkipInAppAlarmFire(rem, {
        todayYMD: today,
        currentTime: '08:05',
        nowMs: baseMs,
        completedHabits: new Set(['h-10']),
      }).skip,
      true
    );

    // (b) Handled native complete for habit+date survives storage reload
    recordNativeHandledAction({
      type: 'complete',
      habitId: 'h-11',
      reminderId: 'r-11',
      date: today,
      occurrenceMinute: '08:00',
      timestamp: baseMs,
    }, storage);
    const loadedState = getHandledNativeState(baseMs + 30_000, storage);
    assert.equal(
      shouldSkipInAppAlarmFire(
        { id: 'r-11', target_type: 'habit', habit_id: 'h-11' },
        {
          todayYMD: today,
          currentTime: '08:01',
          nowMs: baseMs + 30_000,
          handledHabitDates: loadedState.handledHabitDates,
          recentSnoozes: loadedState.recentSnoozes,
          firedKeys: loadedState.firedKeys,
        }
      ).skip,
      true
    );

    // (c) Native snooze within 10 min skips, after 10 min does not block by cooldown
    recordNativeHandledAction({
      type: 'snooze',
      habitId: 'h-12',
      reminderId: 'r-12',
      date: today,
      occurrenceMinute: '08:05',
      timestamp: baseMs,
    }, storage);
    const state5m = getHandledNativeState(baseMs + 5 * 60_000, storage);
    assert.equal(
      shouldSkipInAppAlarmFire(
        { id: 'r-12', target_type: 'habit', habit_id: 'h-12' },
        {
          todayYMD: today,
          currentTime: '08:10',
          nowMs: baseMs + 5 * 60_000,
          handledHabitDates: state5m.handledHabitDates,
          recentSnoozes: state5m.recentSnoozes,
          firedKeys: state5m.firedKeys,
        }
      ).skip,
      true
    );

    // Same minute in persisted firedKeys suppresses re-pop across restart
    assert.equal(
      shouldSkipInAppAlarmFire(
        { id: 'r-12', target_type: 'habit', habit_id: 'h-12' },
        {
          todayYMD: today,
          currentTime: '08:05',
          nowMs: baseMs + 11 * 60_000,
          firedKeys: state5m.firedKeys,
        }
      ).skip,
      true
    );
  });
});
