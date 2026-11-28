import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildNotificationsForReminder,
  shouldSkipInAppAlarmFire,
} from '../src/lib/nativeNotifications.js';
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
  dismissAlarmPermissionPromptForSession,
  evaluateAlarmPermissionPrompt,
  getAlarmPermissionPromptSession,
  markAlarmPermissionPromptShown,
  resetAlarmPermissionPromptSession,
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

test('Bug 5: Combined alarm permissions modal rules, session-only suppression, manifest, and no battery exemptions', () => {
  resetAlarmPermissionPromptSession();

  // Web is never prompted
  const webRes = evaluateAlarmPermissionPrompt({
    isNative: false,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
  });
  assert.equal(webRes.shouldOpen, false);
  assert.deepEqual(webRes.missingItems, []);

  // Android < 14 with FSI not needed & overlay denied shows ONLY overlay item
  const below14OverlayDenied = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: false,
    fsiGranted: false,
    overlayGranted: false,
  });
  assert.equal(below14OverlayDenied.shouldOpen, true);
  assert.deepEqual(below14OverlayDenied.missingItems.map((i) => i.id), ['overlay']);

  // Android 14+ with BOTH denied shows BOTH items in order
  const bothDenied = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
  });
  assert.equal(bothDenied.shouldOpen, true);
  assert.deepEqual(bothDenied.missingItems.map((i) => i.id), ['fsi', 'overlay']);

  // After "Later", should not re-open in the same session, even if both denied
  markAlarmPermissionPromptShown();
  dismissAlarmPermissionPromptForSession();
  const sess = getAlarmPermissionPromptSession();
  assert.equal(sess.dismissed, true);

  const afterLater = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: false,
    overlayGranted: false,
    shownThisSession: sess.shown,
    dismissedThisSession: sess.dismissed,
  });
  assert.equal(afterLater.shouldOpen, false);

  // Live refresh while modal is already open updates remaining item and closes when all granted
  const partialWhileOpen = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: true,
    overlayGranted: false,
    shownThisSession: true,
    dismissedThisSession: false,
    currentlyOpen: true,
  });
  assert.equal(partialWhileOpen.shouldOpen, true);
  assert.deepEqual(partialWhileOpen.missingItems.map((i) => i.id), ['overlay']);

  const allGrantedWhileOpen = evaluateAlarmPermissionPrompt({
    isNative: true,
    fsiNeeded: true,
    fsiGranted: true,
    overlayGranted: true,
    shownThisSession: true,
    dismissedThisSession: false,
    currentlyOpen: true,
  });
  assert.equal(allGrantedWhileOpen.shouldOpen, false);
  assert.equal(allGrantedWhileOpen.shouldClose, true);

  // Fresh app session opens again if missing (no permanent localStorage habiz_fsi_prompted)
  resetAlarmPermissionPromptSession();
  const remindersSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Reminders.jsx'), 'utf8');
  const promptSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlarmPermissionPromptModal.jsx'), 'utf8');
  assert.equal(remindersSrc.includes('habiz_fsi_prompted'), false);
  assert.equal(promptSrc.includes('localStorage'), false);

  // Manifest & Kotlin compliance checks: SYSTEM_ALERT_WINDOW present, NO battery optimization permissions
  const manifestSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const pluginSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/habiz/app/alarm/NativeAlarmSchedulerPlugin.kt'), 'utf8');
  assert.match(manifestSrc, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.equal(manifestSrc.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false);
  assert.equal(pluginSrc.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false);
  assert.equal(pluginSrc.includes('isIgnoringBatteryOptimizations'), false);
  assert.match(pluginSrc, /fun canShowOverlays/);
  assert.match(pluginSrc, /fun openOverlaySettings/);
});
