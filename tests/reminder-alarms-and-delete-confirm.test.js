import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildNotificationsForReminder,
  processPendingAlarmActions,
  shouldSkipInAppAlarmFire,
} from '../src/lib/nativeNotifications.js';
import {
  executeReminderDone,
  normalizeReminderActionMode,
} from '../src/lib/goalReminderActions.js';
import {
  formatGoalPickerLabel,
  formatJourneyPickerLabel,
  getFirstActiveTargetId,
  isGoalCompleted,
  isJourneyCompleted,
  resolveEditedTargetId,
  sortTargetsActiveFirst,
} from '../src/lib/reminderPickerUtils.js';
import {
  getAlarmDeepLink,
  getAlarmEntityId,
  makeAlarmQueueKey,
  normalizeIncomingAlarmItem,
  removeAlarmQueueItem,
  shouldCallHabitTrackingForTakeoverAction,
  upsertAlarmQueueItem,
} from '../src/lib/alarmQueueUtils.js';
import {
  ALARM_PERMISSION_PROMPT_SEEN_KEY,
  evaluateAlarmPermissionPrompt,
  hasSeenAlarmPermissionPrompt,
  markAlarmPermissionPromptSeen,
  resetAlarmPermissionPromptForTests,
} from '../src/lib/alarmPermissionPrompt.js';

const ROOT = process.cwd();

test('Bug 1: Reminders.jsx replaces window.confirm with in-app delete confirmation Modal', () => {
  const remindersSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Reminders.jsx'), 'utf8');
  assert.equal(/\bconfirm\s*\(/.test(remindersSrc), false, 'Blocking window.confirm() must be removed');
  assert.match(remindersSrc, /pendingDeleteReminder/);
  assert.match(remindersSrc, /title="Delete Reminder"/);
  assert.match(remindersSrc, />\s*Cancel\s*</);
  assert.match(remindersSrc, /Deleting\.\.\.'\s*:\s*'Delete'/);
  assert.match(remindersSrc, /handleConfirmDelete/);
});

test('Bug 2: Non-habit reminders (goal, learning_journey, learning_topic) support is_alarm and completed-target suppression', () => {
  const now = new Date(2026, 10, 26, 7, 0, 0); // 07:00 AM local

  const goalAlarm = {
    id: 'rem-goal-1',
    target_type: 'goal',
    goal_id: 'goal-1',
    reminder_mode: 'scheduled',
    reminder_time: '08:00',
    days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    is_alarm: true,
    goals: { id: 'goal-1', goal_name: 'Run Half Marathon', status: 'In Progress' },
  };
  const journeyAlarm = {
    id: 'rem-journey-1',
    target_type: 'learning_journey',
    journey_id: 'journey-1',
    reminder_mode: 'scheduled',
    reminder_time: '08:30',
    days_of_week: ['Everyday'],
    is_alarm: true,
    learning_journeys: { id: 'journey-1', title: 'Systems Design', status: 'Active' },
  };
  const topicAlarm = {
    id: 'rem-topic-1',
    target_type: 'learning_topic',
    journey_id: 'journey-1',
    topic_id: 'topic-1',
    reminder_mode: 'scheduled',
    reminder_time: '09:00',
    days_of_week: ['Everyday'],
    is_alarm: true,
    learning_journeys: { id: 'journey-1', title: 'Systems Design', status: 'Active' },
    learning_topics: { id: 'topic-1', title: 'Consistent Hashing', status: 'In Progress' },
  };

  for (const rem of [goalAlarm, journeyAlarm, topicAlarm]) {
    const built = buildNotificationsForReminder(rem, '', { now });
    assert.ok(built.length > 0, `Expected alarm occurrences for ${rem.target_type}`);
    assert.equal(built[0].channelId, 'habiz_alarm_channel');
    assert.equal(built[0].sound, 'alarm.wav');
    assert.equal(built[0].extra.isAlarm, true);
    assert.ok(built[0].title.startsWith('🚨 ALARM:'), `Expected alarm title prefix, got: ${built[0].title}`);
  }

  // Completed goal/milestone/journey/topic alarms must NOT schedule or fire in-app
  const completedGoalAlarm = {
    ...goalAlarm,
    goals: { ...goalAlarm.goals, status: 'Completed' },
  };
  assert.deepEqual(buildNotificationsForReminder(completedGoalAlarm, '', { now }), []);
  assert.equal(
    shouldSkipInAppAlarmFire(goalAlarm, {
      completedGoals: new Set(['goal-1']),
    }).skip,
    true
  );

  const completedTopicAlarm = {
    ...topicAlarm,
    learning_topics: { ...topicAlarm.learning_topics, status: 'Completed' },
  };
  assert.deepEqual(buildNotificationsForReminder(completedTopicAlarm, '', { now }), []);
  assert.equal(
    shouldSkipInAppAlarmFire(topicAlarm, {
      completedLearning: new Set(['topic-1']),
    }).skip,
    true
  );

  assert.equal(getAlarmEntityId(goalAlarm), 'goal-1');
  assert.equal(getAlarmEntityId(journeyAlarm), 'journey-1');
  assert.equal(getAlarmEntityId(topicAlarm), 'topic-1');
  assert.equal(getAlarmEntityId({ target_type: 'habit', habit_id: 'habit-1' }), 'habit-1');
});

test('Bug 3: Simultaneous habit, goal, and learning alarms queue cleanly by ${targetType}:${entityId} without habit tracking side effects', () => {
  const habitItem = normalizeIncomingAlarmItem({
    targetType: 'habit',
    entityId: 'shared-uuid',
    habit: { id: 'shared-uuid', habit_name: 'Morning Run' },
    reminder: { id: 'rem-h', target_type: 'habit', habit_id: 'shared-uuid', is_alarm: true },
  });
  const goalItem = normalizeIncomingAlarmItem({
    targetType: 'goal',
    entityId: 'shared-uuid',
    habit: null,
    reminder: {
      id: 'rem-g',
      target_type: 'goal',
      goal_id: 'shared-uuid',
      is_alarm: true,
      goals: { goal_name: 'Ship Release' },
    },
  });
  const learningItem = normalizeIncomingAlarmItem({
    targetType: 'learning_topic',
    entityId: 'topic-7',
    habit: null,
    reminder: {
      id: 'rem-l',
      target_type: 'learning_topic',
      journey_id: 'journey-3',
      topic_id: 'topic-7',
      is_alarm: true,
      learning_journeys: { title: 'Distributed Systems' },
      learning_topics: { title: 'Raft Consensus' },
    },
  });

  assert.equal(makeAlarmQueueKey('habit', 'shared-uuid'), 'habit:shared-uuid');
  assert.equal(makeAlarmQueueKey('goal', 'shared-uuid'), 'goal:shared-uuid');
  assert.equal(learningItem.queueKey, 'learning_topic:topic-7');

  let queue = [];
  queue = upsertAlarmQueueItem(queue, habitItem);
  queue = upsertAlarmQueueItem(queue, goalItem);
  queue = upsertAlarmQueueItem(queue, learningItem);

  assert.equal(queue.length, 3, 'Habit and Goal with same UUID + Learning topic must coexist in queue');

  // Re-firing same habit updates in place without removing goal/learning
  queue = upsertAlarmQueueItem(queue, { ...habitItem, streak: 12 });
  assert.equal(queue.length, 3);
  assert.equal(queue[0].streak, 12);

  assert.equal(getAlarmDeepLink(goalItem), '/goals');
  assert.equal(getAlarmDeepLink(learningItem), '/learning/journey/journey-3');
  assert.equal(getAlarmDeepLink({ targetType: 'learning_journey', journeyId: '' }), '/learning');

  // Tracking guard: goal/learning Open, Snooze, Dismiss must NEVER call habit /api/tracking
  for (const action of ['open', 'snooze', 'dismiss', 'mark_done']) {
    assert.equal(shouldCallHabitTrackingForTakeoverAction(goalItem, action), false);
    assert.equal(shouldCallHabitTrackingForTakeoverAction(learningItem, action), false);
  }
  assert.equal(shouldCallHabitTrackingForTakeoverAction(habitItem, 'mark_done'), true);
  assert.equal(shouldCallHabitTrackingForTakeoverAction(habitItem, 'snooze'), false);

  queue = removeAlarmQueueItem(queue, goalItem.queueKey);
  assert.deepEqual(
    queue.map((i) => i.queueKey),
    ['habit:shared-uuid', 'learning_topic:topic-7']
  );
});

test('Bug 4: Completed goals & learning journeys sort last, default skips completed, and editing completed keeps label', () => {
  const goals = [
    { id: 'g-done-1', goal_name: 'Done Goal', status: 'Completed', target_date: '2026-10-01' },
    { id: 'g-active-1', goal_name: 'Active Goal', status: 'In Progress', target_date: '2026-12-15' },
  ];
  const allCompletedGoals = [
    { id: 'g-done-1', goal_name: 'Done Goal', status: 'Completed' },
  ];
  const journeys = [
    { id: 'j-done', title: 'Done Journey', status: 'Completed' },
    { id: 'j-active', title: 'Active Journey', status: 'In Progress' },
  ];

  const sortedGoals = sortTargetsActiveFirst(goals, isGoalCompleted);
  assert.deepEqual(sortedGoals.map((g) => g.id), ['g-active-1', 'g-done-1']);
  assert.equal(formatGoalPickerLabel(goals[0]), 'Done Goal (Deadline: 2026-10-01) (Completed)');
  assert.equal(formatGoalPickerLabel(goals[1]), 'Active Goal (Deadline: 2026-12-15)');

  const sortedJourneys = sortTargetsActiveFirst(journeys, isJourneyCompleted);
  assert.deepEqual(sortedJourneys.map((j) => j.id), ['j-active', 'j-done']);
  assert.equal(formatJourneyPickerLabel(journeys[0]), 'Done Journey (Completed)');

  assert.equal(getFirstActiveTargetId(goals, isGoalCompleted), 'g-active-1');
  assert.equal(getFirstActiveTargetId(allCompletedGoals, isGoalCompleted), '');
  assert.equal(getFirstActiveTargetId(journeys, isJourneyCompleted), 'j-active');

  // Editing an existing reminder tied to a now-completed target still preserves its ID
  assert.equal(resolveEditedTargetId(goals, 'g-done-1', isGoalCompleted), 'g-done-1');
  assert.equal(resolveEditedTargetId(journeys, 'j-done', isJourneyCompleted), 'j-done');
  assert.equal(resolveEditedTargetId(goals, 'missing-id', isGoalCompleted), 'g-active-1');

  const remindersSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Reminders.jsx'), 'utf8');
  assert.match(remindersSrc, /sortTargetsActiveFirst\(goals,\s*isGoalCompleted\)/);
  assert.match(remindersSrc, /sortTargetsActiveFirst\(journeys,\s*isJourneyCompleted\)/);
  assert.match(remindersSrc, /disabled=\{isGoalCompleted\(g\)\}/);
  assert.match(remindersSrc, /disabled=\{isJourneyCompleted\(j\)\}/);
});

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

test('Bug 5 & Problem 3: Alarm permission prompt shows ONCE EVER per install, persists across restarts, and manual Profile trigger works', () => {
  const storage = createMemoryStorage();
  resetAlarmPermissionPromptForTests(storage);

  // Web is never prompted
  const webRes = evaluateAlarmPermissionPrompt({
    isNative: false,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
    seenEver: false,
    trigger: 'auto',
  });
  assert.equal(webRes.shouldOpen, false);
  assert.deepEqual(webRes.missingItems, []);

  // Nothing missing -> auto never opens
  const allGrantedAuto = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: true,
    overlayGranted: true,
    seenEver: false,
    trigger: 'auto',
  });
  assert.equal(allGrantedAuto.shouldOpen, false);

  // Android < 14 with FSI not needed & overlay denied shows ONLY overlay item on first entry
  const below14OverlayDenied = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: false,
    fsiGranted: false,
    overlayGranted: false,
    seenEver: hasSeenAlarmPermissionPrompt(storage),
    trigger: 'auto',
  });
  assert.equal(below14OverlayDenied.shouldOpen, true);
  assert.deepEqual(below14OverlayDenied.missingItems.map((i) => i.id), ['overlay']);

  // Android 14+ with BOTH denied shows BOTH items in order on first entry
  const bothDenied = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
    seenEver: hasSeenAlarmPermissionPrompt(storage),
    trigger: 'auto',
  });
  assert.equal(bothDenied.shouldOpen, true);
  assert.deepEqual(bothDenied.missingItems.map((i) => i.id), ['fsi', 'overlay']);

  // Once shown/marked seen, auto NEVER re-opens again — even in a fresh process reading same storage
  markAlarmPermissionPromptSeen(storage);
  assert.equal(storage.getItem(ALARM_PERMISSION_PROMPT_SEEN_KEY), '1');

  // Clear ONLY in-memory flag (simulate Android WebView kill & cold restart keeping storage)
  resetAlarmPermissionPromptForTests();
  assert.equal(hasSeenAlarmPermissionPrompt(storage), true);

  const afterRestart = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
    seenEver: hasSeenAlarmPermissionPrompt(storage),
    trigger: 'auto',
  });
  assert.equal(afterRestart.shouldOpen, false);

  // Explicit manual trigger still opens even after seenEver=true
  const manualOpen = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
    seenEver: true,
    trigger: 'manual',
  });
  assert.equal(manualOpen.shouldOpen, true);
  assert.deepEqual(manualOpen.missingItems.map((i) => i.id), ['fsi', 'overlay']);

  // Live refresh while modal is already open updates remaining item and closes when both granted
  const partialWhileOpen = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: true,
    overlayGranted: false,
    seenEver: true,
    trigger: 'auto',
    currentlyOpen: true,
  });
  assert.equal(partialWhileOpen.shouldOpen, true);
  assert.deepEqual(partialWhileOpen.missingItems.map((i) => i.id), ['overlay']);

  const allGrantedWhileOpen = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: true,
    overlayGranted: true,
    seenEver: true,
    trigger: 'auto',
    currentlyOpen: true,
  });
  assert.equal(allGrantedWhileOpen.shouldOpen, false);
  assert.equal(allGrantedWhileOpen.shouldClose, true);

  // Static assertions for Problem 3 & Problem 2 Android hardening
  const remindersSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Reminders.jsx'), 'utf8');
  const promptSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlarmPermissionPromptModal.jsx'), 'utf8');
  const profileSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Profile.jsx'), 'utf8');
  assert.equal(remindersSrc.includes('habiz_fsi_prompted'), false);
  assert.equal(remindersSrc.includes('requestAlarmPermissionCheck'), false);
  assert.match(promptSrc, /if\s*\(!open\s*\|\|\s*!isNative\)\s*return undefined;/);
  assert.match(profileSrc, /Alarm permissions/);
  assert.match(profileSrc, /Copy alarm diagnostics/);

  // Manifest & Kotlin compliance checks: SYSTEM_ALERT_WINDOW, USE_FULL_SCREEN_INTENT, taskAffinity, split try/fallback
  const manifestSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const pluginSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/habiz/app/alarm/NativeAlarmSchedulerPlugin.kt'), 'utf8');
  const receiverSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/habiz/app/alarm/AlarmReceiver.kt'), 'utf8');
  assert.match(manifestSrc, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(manifestSrc, /android\.permission\.USE_FULL_SCREEN_INTENT/);
  assert.match(manifestSrc, /android:taskAffinity=""/);
  assert.equal(manifestSrc.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false);
  assert.equal(pluginSrc.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false);
  assert.equal(pluginSrc.includes('isIgnoringBatteryOptimizations'), false);
  assert.match(pluginSrc, /fun canShowOverlays/);
  assert.match(pluginSrc, /fun openOverlaySettings/);
  assert.match(pluginSrc, /fun getAlarmDiagnostics/);
  assert.match(receiverSrc, /ContextCompat\.startForegroundService[\s\S]*catch[\s\S]*context\.startActivity[\s\S]*catch/);
  assert.match(receiverSrc, /NotificationManagerCompat\.from\(context\)\.notify/);
});

test('Problem 1A: normalizeReminderActionMode & executeReminderDone handle confirm_goal and confirm_journey (with or without override)', async () => {
  const storage = createMemoryStorage();
  assert.equal(normalizeReminderActionMode('confirm_goal'), 'complete_goal');
  assert.equal(normalizeReminderActionMode('confirm_journey'), 'complete_journey');
  assert.equal(normalizeReminderActionMode('complete_habit'), 'complete_habit');

  const calls = [];
  const goalResWithOverride = await executeReminderDone({
    reminder: { id: 'r1', target_type: 'goal', goal_id: 'g1', notification_status: 'Active' },
    modeOverride: 'confirm_goal',
    session: { access_token: 'tok', user: { id: 'u1' } },
    isOnline: true,
    fetchImpl: async (url, opts) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({}) };
    },
    storage,
    todayYMD: '2026-11-28',
  });
  assert.equal(goalResWithOverride.ok, true);

  const goalResNoOverride = await executeReminderDone({
    reminder: { id: 'r2', target_type: 'goal', goal_id: 'g2', notification_status: 'Active' },
    session: { access_token: 'tok', user: { id: 'u1' } },
    isOnline: true,
    hasMilestones: false,
    fetchImpl: async (url, opts) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({}) };
    },
    storage,
    todayYMD: '2026-11-28',
  });
  assert.equal(goalResNoOverride.ok, true);

  const journeyResWithOverride = await executeReminderDone({
    reminder: { id: 'r3', target_type: 'learning_journey', journey_id: 'j1', notification_status: 'Active' },
    modeOverride: 'confirm_journey',
    session: { access_token: 'tok', user: { id: 'u1' } },
    isOnline: true,
    fetchImpl: async (url, opts) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({}) };
    },
    storage,
    todayYMD: '2026-11-28',
  });
  assert.equal(journeyResWithOverride.ok, true);

  assert.deepEqual(calls, [
    { url: '/api/goals', method: 'PUT', body: { id: 'g1', status: 'Completed' } },
    { url: '/api/goals', method: 'PUT', body: { id: 'g2', status: 'Completed' } },
    { url: '/api/learning?action=update_journey', method: 'PUT', body: { id: 'j1', status: 'Completed' } },
  ]);

  const unknownRes = await executeReminderDone({
    reminder: { id: 'r4', target_type: 'goal', goal_id: 'g4' },
    modeOverride: 'completely_unknown_mode',
  });
  assert.equal(unknownRes.ok, false);
  assert.match(unknownRes.error, /completely_unknown_mode/);
});

function setupMockWindowEvents(t) {
  const emittedEvents = [];
  const origWindow = globalThis.window;
  const origCustomEvent = globalThis.CustomEvent;

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent(ev) {
      emittedEvents.push({ type: ev.type, detail: ev.detail });
    },
  };
  t.after(() => {
    globalThis.window = origWindow;
    globalThis.CustomEvent = origCustomEvent;
  });

  return emittedEvents;
}

const E2E_SERVER_REMINDERS = [
  { id: 'rem-ms', target_type: 'goal', goal_id: 'goal-ms', milestone_id: 'ms-9', reminder_mode: 'scheduled', notification_status: 'Active' },
  { id: 'rem-g-noms', target_type: 'goal', goal_id: 'goal-noms', goal_has_milestones: false, reminder_mode: 'scheduled', notification_status: 'Active' },
  { id: 'rem-topic', target_type: 'learning_topic', journey_id: 'j-10', topic_id: 'topic-10', reminder_mode: 'scheduled', notification_status: 'Active' },
  { id: 'rem-journey', target_type: 'learning_journey', journey_id: 'j-20', reminder_mode: 'scheduled', notification_status: 'Active' },
];

test('Problem 1 E2E (Goal with milestone): native complete resolves reminder -> PUT /api/milestones + /api/reminders Done + ack + events', async (t) => {
  const storage = createMemoryStorage();
  const emittedEvents = setupMockWindowEvents(t);
  const fetchCalls = [];
  const acked = [];

  const res = await processPendingAlarmActions(
    { access_token: 'tok', user: { id: 'u1' } },
    {
      isNativeOverride: true,
      skipCacheLookup: true,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        async getPendingAlarmActions() {
          return {
            actions: [{ id: 'act-ms', type: 'complete', habitId: 'goal-ms', reminderId: 'rem-ms', targetType: 'goal', date: '2026-11-28', timestamp: 101 }],
          };
        },
        async ackPendingAlarmActions(payload) { acked.push(payload); },
      },
      fetchImpl: async (url, opts = {}) => {
        fetchCalls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
        if (url === '/api/reminders' && (!opts.method || opts.method === 'GET')) {
          return { ok: true, json: async () => E2E_SERVER_REMINDERS };
        }
        return { ok: true, json: async () => ({}) };
      },
    }
  );

  assert.deepEqual(res.ackedIds, ['act-ms']);
  assert.equal(acked.length, 1);
  assert.deepEqual(fetchCalls, [
    { url: '/api/reminders', method: 'GET', body: null },
    { url: '/api/milestones', method: 'PUT', body: { id: 'ms-9', completed: true } },
    { url: '/api/reminders', method: 'PUT', body: { id: 'rem-ms', notification_status: 'Done' } },
  ]);
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-stats-updated'));
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-entity-completed' && e.detail.entityId === 'ms-9'));
});

test('Problem 1 E2E (Goal without milestones): native complete resolves reminder -> PUT /api/goals Completed + ack + events', async (t) => {
  const storage = createMemoryStorage();
  const emittedEvents = setupMockWindowEvents(t);
  const fetchCalls = [];

  const res = await processPendingAlarmActions(
    { access_token: 'tok', user: { id: 'u1' } },
    {
      isNativeOverride: true,
      skipCacheLookup: true,
      reminders: E2E_SERVER_REMINDERS,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        async getPendingAlarmActions() {
          return {
            actions: [{ id: 'act-g-noms', type: 'complete', habitId: 'goal-noms', reminderId: 'rem-g-noms', targetType: 'goal', date: '2026-11-28', timestamp: 102 }],
          };
        },
        async ackPendingAlarmActions() {},
      },
      fetchImpl: async (url, opts = {}) => {
        fetchCalls.push({ url, method: opts.method || 'GET', body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({}) };
      },
    }
  );

  assert.deepEqual(res.ackedIds, ['act-g-noms']);
  assert.deepEqual(fetchCalls, [
    { url: '/api/goals', method: 'PUT', body: { id: 'goal-noms', status: 'Completed' } },
  ]);
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-stats-updated'));
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-entity-completed' && e.detail.entityId === 'goal-noms'));
});

test('Problem 1 E2E (Learning topic): native complete resolves reminder -> PUT update_topic Completed + ack + events', async (t) => {
  const storage = createMemoryStorage();
  const emittedEvents = setupMockWindowEvents(t);
  const fetchCalls = [];

  const res = await processPendingAlarmActions(
    { access_token: 'tok', user: { id: 'u1' } },
    {
      isNativeOverride: true,
      skipCacheLookup: true,
      reminders: E2E_SERVER_REMINDERS,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        async getPendingAlarmActions() {
          return {
            actions: [{ id: 'act-topic', type: 'complete', habitId: 'topic-10', reminderId: 'rem-topic', targetType: 'learning_topic', date: '2026-11-28', timestamp: 103 }],
          };
        },
        async ackPendingAlarmActions() {},
      },
      fetchImpl: async (url, opts = {}) => {
        fetchCalls.push({ url, method: opts.method || 'GET', body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({}) };
      },
    }
  );

  assert.deepEqual(res.ackedIds, ['act-topic']);
  assert.deepEqual(fetchCalls, [
    { url: '/api/learning?action=update_topic', method: 'PUT', body: { id: 'topic-10', status: 'Completed' } },
  ]);
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-stats-updated'));
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-entity-completed' && e.detail.entityId === 'topic-10'));
});

test('Problem 1 E2E (Learning journey): native complete resolves reminder -> PUT update_journey Completed + ack + events', async (t) => {
  const storage = createMemoryStorage();
  const emittedEvents = setupMockWindowEvents(t);
  const fetchCalls = [];

  const res = await processPendingAlarmActions(
    { access_token: 'tok', user: { id: 'u1' } },
    {
      isNativeOverride: true,
      skipCacheLookup: true,
      reminders: E2E_SERVER_REMINDERS,
      storage,
      getOnlineStatusImpl: () => true,
      scheduler: {
        async getPendingAlarmActions() {
          return {
            actions: [{ id: 'act-journey', type: 'complete', habitId: 'j-20', reminderId: 'rem-journey', targetType: 'learning_journey', date: '2026-11-28', timestamp: 104 }],
          };
        },
        async ackPendingAlarmActions() {},
      },
      fetchImpl: async (url, opts = {}) => {
        fetchCalls.push({ url, method: opts.method || 'GET', body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({}) };
      },
    }
  );

  assert.deepEqual(res.ackedIds, ['act-journey']);
  assert.deepEqual(fetchCalls, [
    { url: '/api/learning?action=update_journey', method: 'PUT', body: { id: 'j-20', status: 'Completed' } },
  ]);
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-stats-updated'));
  assert.ok(emittedEvents.some((e) => e.type === 'habittracker-entity-completed' && e.detail.entityId === 'j-20'));
});

test('Problem 1B: Unresolvable pending native action is NOT acked and logs clear warning with reminderId', async () => {
  const storage = createMemoryStorage();
  let ackCalled = false;
  let warnMsg = '';
  const origWarn = console.warn;
  console.warn = (msg) => { warnMsg += String(msg); };
  try {
    const res = await processPendingAlarmActions(
      { access_token: 'tok', user: { id: 'u1' } },
      {
        isNativeOverride: true,
        skipCacheLookup: true,
        reminders: [],
        storage,
        getOnlineStatusImpl: () => false,
        scheduler: {
          async getPendingAlarmActions() {
            return {
              actions: [{ id: 'act-missing', type: 'complete', habitId: 'g-missing', reminderId: 'rem-does-not-exist', targetType: 'goal', date: '2026-11-28', timestamp: 105 }],
            };
          },
          async ackPendingAlarmActions() { ackCalled = true; },
        },
        fetchImpl: async () => { throw new Error('Should not fetch when offline'); },
      }
    );
    assert.equal(res.processed, 0);
    assert.equal(ackCalled, false);
    assert.match(warnMsg, /rem-does-not-exist/);
  } finally {
    console.warn = origWarn;
  }
});

test('Problem 1C static: Goals, LearningHubDashboard, and LearningJourneyDetail register and remove refresh listeners', () => {
  for (const relPath of [
    'src/pages/Goals.jsx',
    'src/pages/LearningHubDashboard.jsx',
    'src/pages/LearningJourneyDetail.jsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.match(src, /addEventListener\(['"]habittracker-stats-updated['"]/);
    assert.match(src, /removeEventListener\(['"]habittracker-stats-updated['"]/);
    assert.match(src, /addEventListener\(['"]habittracker-entity-completed['"]/);
    assert.match(src, /removeEventListener\(['"]habittracker-entity-completed['"]/);
  }
});
