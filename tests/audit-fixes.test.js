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
      remindersCode.includes('r.id === editing.id ? { ...r, ...originalReminder } : r'),
      'Failed reminder edit must only revert the edited reminder'
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
});

