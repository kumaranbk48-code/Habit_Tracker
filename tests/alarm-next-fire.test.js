import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationsForReminder, getNextFireTime } from '../src/lib/nativeNotifications.js';

test('Alarm & Reminder next fire time scheduling (8-day window + past-time handling)', async (t) => {
  // Wed Nov 25 2026 10:00:00 local time
  const wed10am = new Date(2026, 10, 25, 10, 0, 0, 0);

  await t.test('setting 9:15 AM at 10:00 AM skips today and gives first ring tomorrow 9:15 AM', () => {
    const reminder = {
      id: 'rem-past-today',
      target_type: 'habit',
      habit_id: 'h-1',
      reminder_time: '09:15',
      alerts: ['09:15'],
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      is_alarm: true,
    };

    const notifs = buildNotificationsForReminder(reminder, 'Read', { now: wed10am });
    assert.ok(notifs.every((n) => n.schedule.at.getTime() > wed10am.getTime()), 'No notification may be in the past');

    const first = getNextFireTime(reminder, wed10am);
    assert.ok(first instanceof Date);
    assert.equal(first.getFullYear(), 2026);
    assert.equal(first.getMonth(), 10);
    assert.equal(first.getDate(), 26); // Tomorrow (Thu Nov 26)
    assert.equal(first.getHours(), 9);
    assert.equal(first.getMinutes(), 15);
  });

  await t.test('single weekday matching today with past time schedules next week same weekday (offset 7)', () => {
    const reminder = {
      id: 'rem-single-wed',
      target_type: 'habit',
      habit_id: 'h-1',
      reminder_time: '09:15',
      alerts: ['09:15'],
      days_of_week: ['Wed'],
      is_alarm: true,
    };

    const notifs = buildNotificationsForReminder(reminder, 'Weekly Review', { now: wed10am });
    assert.equal(notifs.length, 1, 'Must schedule exactly 1 occurrence for next Wednesday');

    const first = getNextFireTime(reminder, wed10am);
    assert.ok(first instanceof Date);
    assert.equal(first.getDay(), 3); // Wednesday
    assert.equal(first.getDate(), 2); // Dec 2 2026 (7 days after Nov 25)
    assert.equal(first.getMonth(), 11); // December
    assert.equal(first.getHours(), 9);
    assert.equal(first.getMinutes(), 15);
  });

  await t.test('future time today (6:30 PM at 10:00 AM) gives first ring today 6:30 PM', () => {
    const reminder = {
      id: 'rem-future-today',
      target_type: 'habit',
      habit_id: 'h-2',
      reminder_time: '18:30',
      alerts: ['18:30'],
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      is_alarm: true,
    };

    const first = getNextFireTime(reminder, wed10am);
    assert.ok(first instanceof Date);
    assert.equal(first.getFullYear(), 2026);
    assert.equal(first.getMonth(), 10);
    assert.equal(first.getDate(), 25); // Today (Wed Nov 25)
    assert.equal(first.getHours(), 18);
    assert.equal(first.getMinutes(), 30);

    // 8-day window with everyday future time schedules 8 distinct days (offsets 0..7) with unique IDs
    const notifs = buildNotificationsForReminder(reminder, 'Evening Walk', { now: wed10am });
    assert.equal(notifs.length, 8);
    const uniqueIds = new Set(notifs.map((n) => n.id));
    assert.equal(uniqueIds.size, 8, 'All 8 scheduled day IDs must be unique');
  });

  await t.test('completed-today habit skips today even for a future time and gives tomorrow', () => {
    const reminder = {
      id: 'rem-completed-today',
      target_type: 'habit',
      habit_id: 'h-done',
      reminder_time: '18:30',
      alerts: ['18:30'],
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      is_alarm: true,
    };

    const completedHabitIds = new Set(['h-done']);
    const first = getNextFireTime(reminder, wed10am, { completedHabitIds });
    assert.ok(first instanceof Date);
    assert.equal(first.getDate(), 26); // Skipped today (25), first ring is tomorrow (26)
    assert.equal(first.getHours(), 18);
    assert.equal(first.getMinutes(), 30);
  });

  await t.test('custom days respected (e.g. Mon & Fri on Wed gives Friday)', () => {
    const reminder = {
      id: 'rem-custom-days',
      target_type: 'habit',
      habit_id: 'h-custom',
      reminder_time: '08:00',
      alerts: ['08:00'],
      days_of_week: ['Mon', 'Fri'],
      is_alarm: false,
    };

    const first = getNextFireTime(reminder, wed10am);
    assert.ok(first instanceof Date);
    assert.equal(first.getDay(), 5); // Friday
    assert.equal(first.getDate(), 27); // Fri Nov 27 2026
    assert.equal(first.getHours(), 8);
    assert.equal(first.getMinutes(), 0);
  });
});
