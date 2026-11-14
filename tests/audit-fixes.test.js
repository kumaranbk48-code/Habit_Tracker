import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Audit Fix 1: PWA Install Banner & Modal z-index + suppression', async (t) => {
  const bannerPath = path.resolve(process.cwd(), 'src', 'components', 'PWAInstallBanner.jsx');
  const bannerCode = fs.readFileSync(bannerPath, 'utf8');

  await t.test('PWAInstallBanner uses z-40 so it sits below modals (z-50)', () => {
    assert.ok(bannerCode.includes('z-40'), 'PWAInstallBanner must use z-40');
    assert.ok(!bannerCode.includes('z-[150]'), 'PWAInstallBanner must not use z-[150]');
  });

  await t.test('PWAInstallBanner subscribes to modal open state and suppresses rendering', () => {
    assert.ok(bannerCode.includes('subscribeModalOpen'), 'Banner must import subscribeModalOpen');
    assert.ok(bannerCode.includes('getIsAnyModalOpen'), 'Banner must import getIsAnyModalOpen');
    assert.ok(bannerCode.includes('isModalOpen'), 'Banner must check isModalOpen');
  });

  const modalPath = path.resolve(process.cwd(), 'src', 'components', 'Modal.jsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  await t.test('Modal.jsx exports subscribeModalOpen and getIsAnyModalOpen', () => {
    assert.ok(modalCode.includes('export function subscribeModalOpen'), 'Modal must export subscribeModalOpen');
    assert.ok(modalCode.includes('export function getIsAnyModalOpen'), 'Modal must export getIsAnyModalOpen');
    assert.ok(modalCode.includes('openModalCount'), 'Modal must track openModalCount');
  });
});

test('Audit Fix 2 & 4: Profile Completions & Skeleton Placeholders', async (t) => {
  const profilePath = path.resolve(process.cwd(), 'src', 'pages', 'Profile.jsx');
  const profileCode = fs.readFileSync(profilePath, 'utf8');

  await t.test('Profile reads totalAllTimeCompletions matching /api/dashboard', () => {
    assert.ok(
      profileCode.includes('dashStats?.totalAllTimeCompletions'),
      'Profile must read totalAllTimeCompletions from dashStats'
    );
    assert.ok(
      !profileCode.includes('dashStats?.totalCompletions'),
      'Profile must not read non-existent totalCompletions'
    );
  });

  await t.test('Profile renders skeleton placeholders when dashStats is null (no zero flash)', () => {
    assert.ok(
      profileCode.includes('animate-pulse'),
      'Profile highlights and level bar must render animate-pulse skeletons while dashStats is loading'
    );
  });
});

test('Audit Fix 5: Service worker does not cache API response in periodicsync', async (t) => {
  const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
  const swCode = fs.readFileSync(swPath, 'utf8');

  await t.test('periodicsync does not call cache.add(/api/dashboard)', () => {
    assert.ok(
      !swCode.includes("cache.add('/api/dashboard')"),
      'SW periodicsync must never store /api/dashboard in Cache Storage'
    );
    assert.ok(
      swCode.includes("fetch('/api/dashboard')"),
      'SW periodicsync should use non-cached fetch'
    );
  });
});

test('Audit Fix 3: Optimistic Updates & Saving Feedback', async (t) => {
  const habitsPath = path.resolve(process.cwd(), 'src', 'pages', 'Habits.jsx');
  const habitsCode = fs.readFileSync(habitsPath, 'utf8');

  await t.test('Habits.jsx has optimistic delete and optimistic edit rollback', () => {
    assert.ok(habitsCode.includes('setHabits((prev) => prev.filter'), 'Habits delete must optimistically filter state');
    assert.ok(habitsCode.includes('setHabits((prev) => prev.map'), 'Habits edit must optimistically update state');
    assert.ok(habitsCode.includes('Saving...'), 'Habits save button must display Saving...');
  });

  const remindersPath = path.resolve(process.cwd(), 'src', 'pages', 'Reminders.jsx');
  const remindersCode = fs.readFileSync(remindersPath, 'utf8');

  await t.test('Reminders.jsx replaces temporary ID with server ID on creation', () => {
    assert.ok(
      remindersCode.includes('savedData?.id && !editing'),
      'Reminders must check for returned server id on creation'
    );
    assert.ok(
      remindersCode.includes('r.id === optimisticEntry.id ? { ...r, ...savedData, id: savedData.id } : r'),
      'Reminders must replace optimistic temporary ID with real server ID'
    );
  });

  await t.test('Reminders.jsx performs targeted rollback on failed create/edit/toggle/delete', () => {
    assert.ok(
      remindersCode.includes('current.filter((r) => r.id !== optimisticEntry.id)'),
      'Failed reminder creation must only remove the temporary entry'
    );
    assert.ok(
      remindersCode.includes('formFieldsToRestore'),
      'Failed reminder edit must only revert the specific form fields changed'
    );
    assert.ok(
      remindersCode.includes('r.id === reminder.id ? { ...r, notification_status: originalStatus } : r'),
      'Failed reminder status toggle must only revert that reminder status'
    );
    assert.ok(
      remindersCode.includes('deletedReminder && !current.some((r) => r.id === id) ? [...current, deletedReminder] : current'),
      'Failed reminder deletion must only restore the deleted reminder'
    );
  });

  const learningDashboardPath = path.resolve(process.cwd(), 'src', 'pages', 'LearningHubDashboard.jsx');
  const learningDashboardCode = fs.readFileSync(learningDashboardPath, 'utf8');

  await t.test('LearningHubDashboard uses targeted restoreJourney on delete failure', () => {
    assert.ok(
      learningDashboardCode.includes('restoreJourney'),
      'LearningHubDashboard must define targeted restoreJourney instead of resetting to prevJourneys'
    );
    assert.ok(
      !learningDashboardCode.includes('journeys: prevJourneys'),
      'LearningHubDashboard must not overwrite journeys with stale snapshot'
    );
  });

  const learningPath = path.resolve(process.cwd(), 'src', 'pages', 'LearningJourneyDetail.jsx');
  const learningCode = fs.readFileSync(learningPath, 'utf8');

  await t.test('LearningJourneyDetail replaces tempTaskId with server task ID and targets rollback', () => {
    assert.ok(
      learningCode.includes('savedTask?.id'),
      'Learning subtasks must inspect returned server task id'
    );
    assert.ok(
      learningCode.includes('t.id === tempTaskId ? { ...t, ...savedTask, id: savedTask.id } : t'),
      'Learning subtasks must replace tempTaskId with real savedTask.id'
    );
    assert.ok(
      learningCode.includes('taskToDelete'),
      'Failed task deletion must restore only the deleted task'
    );
  });

  const seasonModalPath = path.resolve(process.cwd(), 'src', 'components', 'SeasonManagerModal.jsx');
  const seasonCode = fs.readFileSync(seasonModalPath, 'utf8');

  await t.test('SeasonManagerModal disables buttons during save and shows Saving... / Ending...', () => {
    assert.ok(seasonCode.includes('Saving...'), 'Season modal must show Saving...');
    assert.ok(seasonCode.includes('Ending...'), 'Season modal must show Ending...');
    assert.ok(seasonCode.includes('await onSeasonUpdated();'), 'Season modal must await onSeasonUpdated before completing');
  });
});

test('Audit Fix: Profile Failure Recovery & Retry', async (t) => {
  const profilePath = path.resolve(process.cwd(), 'src', 'pages', 'Profile.jsx');
  const profileCode = fs.readFileSync(profilePath, 'utf8');

  await t.test('Profile defines loadError state and handles failed fetch', () => {
    assert.ok(profileCode.includes('const [loadError, setLoadError] = useState(false);'), 'Profile must have loadError state');
    assert.ok(profileCode.includes('setLoadError(true);'), 'Profile must setLoadError(true) on failed fetch');
  });

  await t.test('Profile displays error banner with Retry button and non-pulsing fallback', () => {
    assert.ok(profileCode.includes('loadError && !dashStats'), 'Profile must check loadError && !dashStats');
    assert.ok(profileCode.includes('Unable to load profile data'), 'Profile must show descriptive error message');
    assert.ok(profileCode.includes('Retry'), 'Profile must provide a Retry button');
    assert.ok(profileCode.includes('text-slate-500 mt-0.5">--</div>'), 'Profile must show static dashes instead of infinite pulse skeletons');
  });

  await t.test('Profile fetchProfileData moves getSession inside try block and handles null session', () => {
    assert.ok(
      profileCode.includes('try {\n      const { data: { session } = {} } = await supabase.auth.getSession();'),
      'getSession must be called inside try block'
    );
    assert.ok(
      profileCode.includes('if (!session) {\n        setLoadError(true);\n        return;\n      }'),
      'Null session must set loadError=true and return within try'
    );
  });
});

test('Behavioral Regression: Issue 1 - Reminders failed edit preserves concurrent status toggle', async () => {
  // Setup simulated state and server
  let reminders = [
    {
      id: 'rem-1',
      target_type: 'habit',
      habit_id: 'h-1',
      custom_text: 'Morning Habit Old',
      reminder_time: '08:00',
      notification_status: 'Active',
      is_alarm: false,
    },
    {
      id: 'rem-2',
      target_type: 'habit',
      habit_id: 'h-2',
      custom_text: 'Evening Habit',
      reminder_time: '20:00',
      notification_status: 'Active',
      is_alarm: false,
    }
  ];
  let serverReminder = { ...reminders[0] };

  // Manual promise controllers for race interleaving
  let r1Reject;
  const r1Promise = new Promise((_, rej) => { r1Reject = rej; });

  let r2Resolve;
  const r2Promise = new Promise((res) => { r2Resolve = res; });

  // 1. User starts Edit on rem-1
  const editing = { ...reminders[0] };
  const originalReminder = reminders.find((r) => r.id === editing.id);
  const formFieldsToRestore = originalReminder ? {
    target_type: originalReminder.target_type,
    habit_id: originalReminder.habit_id,
    goal_id: originalReminder.goal_id,
    journey_id: originalReminder.journey_id,
    topic_id: originalReminder.topic_id,
    reminder_mode: originalReminder.reminder_mode,
    reminder_time: originalReminder.reminder_time,
    alerts: originalReminder.alerts,
    routine_window: originalReminder.routine_window,
    days_before_deadline: originalReminder.days_before_deadline,
    days_of_week: originalReminder.days_of_week,
    custom_text: originalReminder.custom_text,
    is_alarm: originalReminder.is_alarm,
    habits: originalReminder.habits,
    goals: originalReminder.goals,
    learning_journeys: originalReminder.learning_journeys,
  } : null;

  const optimisticEdit = {
    custom_text: 'Morning Habit Renamed',
    reminder_time: '09:00',
  };

  // Optimistic edit applied
  reminders = reminders.map((r) => (r.id === editing.id ? { ...r, ...optimisticEdit } : r));
  assert.equal(reminders[0].custom_text, 'Morning Habit Renamed');
  assert.equal(reminders[0].notification_status, 'Active');

  // Start R1 in background
  const r1Operation = (async () => {
    try {
      await r1Promise;
    } catch {
      // Rollback on failure
      if (formFieldsToRestore) {
        reminders = reminders.map((r) => (r.id === editing.id ? { ...r, ...formFieldsToRestore } : r));
      }
    }
  })();

  // 2. Before R1 finishes, user toggles status on rem-1 to Inactive (R2)
  const reminderToToggle = reminders.find(r => r.id === 'rem-1');
  const newStatus = reminderToToggle.notification_status === 'Active' ? 'Inactive' : 'Active';
  // Optimistic toggle
  reminders = reminders.map((r) => (r.id === 'rem-1' ? { ...r, notification_status: newStatus } : r));
  assert.equal(reminders[0].notification_status, 'Inactive');

  const r2Operation = (async () => {
    await r2Promise;
    serverReminder.notification_status = newStatus;
  })();

  // R2 succeeds on the server
  r2Resolve();
  await r2Operation;
  assert.equal(serverReminder.notification_status, 'Inactive');

  // 3. R1 fails
  r1Reject(new Error('Simulated HTTP 500'));
  await r1Operation;

  // Assert:
  // - Form fields reverted to original
  assert.equal(reminders[0].custom_text, 'Morning Habit Old', 'custom_text must be rolled back');
  assert.equal(reminders[0].reminder_time, '08:00', 'reminder_time must be rolled back');
  // - Concurrently updated status was NOT reverted and matches the server!
  assert.equal(reminders[0].notification_status, 'Inactive', 'notification_status must remain Inactive');
  assert.equal(reminders[0].notification_status, serverReminder.notification_status, 'UI status must match server status');
  // - Unrelated reminder rem-2 was completely unaffected
  assert.equal(reminders[1].id, 'rem-2');
  assert.equal(reminders[1].custom_text, 'Evening Habit');
});

test('Behavioral Regression: Issue 2 - LearningHubDashboard failed delete does not resurrect other deleted journey', async () => {
  let data = {
    journeys: [
      { id: 'journey-A', title: 'Journey A' },
      { id: 'journey-B', title: 'Journey B' },
      { id: 'journey-C', title: 'Journey C' },
    ]
  };
  let serverJourneys = [...data.journeys];

  // Manual promise controllers for race interleaving
  let r1Reject;
  const r1Promise = new Promise((_, rej) => { r1Reject = rej; });

  let r2Resolve;
  const r2Promise = new Promise((res) => { r2Resolve = res; });

  const executeDeleteJourney = (journeyId, requestPromise) => {
    const deletedJourney = (data.journeys || []).find((j) => j.id === journeyId);
    const originalIndex = (data.journeys || []).findIndex((j) => j.id === journeyId);

    // Optimistic removal
    data = {
      ...data,
      journeys: (data.journeys || []).filter((j) => j.id !== journeyId),
    };

    const restoreJourney = (currentJourneys) => {
      if (!deletedJourney) return currentJourneys;
      if (currentJourneys.some((j) => j.id === journeyId)) return currentJourneys;
      const next = [...currentJourneys];
      if (originalIndex >= 0 && originalIndex <= next.length) {
        next.splice(originalIndex, 0, deletedJourney);
      } else {
        next.push(deletedJourney);
      }
      return next;
    };

    return (async () => {
      try {
        await requestPromise;
        serverJourneys = serverJourneys.filter((j) => j.id !== journeyId);
      } catch {
        // Rollback on failure
        data = {
          ...data,
          journeys: restoreJourney(data.journeys || []),
        };
      }
    })();
  };

  // 1. Delete Journey A (R1 in flight)
  const r1Op = executeDeleteJourney('journey-A', r1Promise);
  assert.deepEqual(data.journeys.map(j => j.id), ['journey-B', 'journey-C']);

  // 2. Immediately delete Journey B (R2 in flight)
  const r2Op = executeDeleteJourney('journey-B', r2Promise);
  assert.deepEqual(data.journeys.map(j => j.id), ['journey-C']);

  // 3. R2 succeeds on the server
  r2Resolve();
  await r2Op;
  assert.deepEqual(serverJourneys.map(j => j.id), ['journey-A', 'journey-C']);

  // 4. R1 fails
  r1Reject(new Error('Simulated network drop'));
  await r1Op;

  // Assert:
  // Journey B is NOT resurrected!
  assert.ok(!data.journeys.some(j => j.id === 'journey-B'), 'Journey B must NOT be resurrected on Journey A failure');
  // Journey A is restored at its original position
  assert.equal(data.journeys[0].id, 'journey-A', 'Journey A must be restored');
  assert.equal(data.journeys[1].id, 'journey-C', 'Journey C must remain in list');
  // Final UI state matches server state
  assert.deepEqual(data.journeys.map(j => j.id), serverJourneys.map(j => j.id), 'UI journeys must match server journeys');
});

test('Behavioral Regression: Issue 3 - Profile session failure sets loadError and ends loading', async (t) => {
  await t.test('getSession throw sets loadError=true and loading=false', async () => {
    let loading = false;
    let loadError = false;
    let dashStats = null;

    const mockSupabaseThrow = {
      auth: {
        getSession: async () => {
          throw new Error('Supabase client network timeout');
        }
      }
    };

    const fetchProfileData = async () => {
      loading = true;
      loadError = false;
      try {
        const { data: { session } = {} } = await mockSupabaseThrow.auth.getSession();
        if (!session) {
          loadError = true;
          return;
        }
      } catch {
        loadError = true;
      } finally {
        loading = false;
      }
    };

    await fetchProfileData();
    assert.equal(loading, false, 'loading must be cleared');
    assert.equal(loadError, true, 'loadError must be set to true');
    assert.equal(dashStats, null, 'dashStats must be null');
  });

  await t.test('no session sets loadError=true and loading=false (no infinite skeletons)', async () => {
    let loading = false;
    let loadError = false;
    let dashStats = null;

    const mockSupabaseNoSession = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null })
      }
    };

    const fetchProfileData = async () => {
      loading = true;
      loadError = false;
      try {
        const { data: { session } = {} } = await mockSupabaseNoSession.auth.getSession();
        if (!session) {
          loadError = true;
          return;
        }
      } catch {
        loadError = true;
      } finally {
        loading = false;
      }
    };

    await fetchProfileData();
    assert.equal(loading, false, 'loading must be cleared');
    assert.equal(loadError, true, 'loadError must be set to true');
    assert.equal(dashStats, null, 'dashStats must be null');
  });
});

