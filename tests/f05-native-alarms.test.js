import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

// Verify F-05 comparator & 50-alarm cap behavior with 60 randomized alarms
const source = fs.readFileSync(new URL('../src/lib/nativeNotifications.js', import.meta.url), 'utf8');
const match = source.match(/const getAlarmAt =[\s\S]*?const boundedAlarms = nativeAlarms\.slice\(0, 50\);/);
assert.ok(match, 'Comparator block must exist in nativeNotifications.js');

const sortAndCap = new Function('nativeAlarms', `${match[0]}\nreturn boundedAlarms;`);

test('F-05 keeps strictly the earliest 50 alarms out of 60 randomized alarms', () => {
  const base = 1700000000000;
  // Create 60 alarms at +1min..+60min
  const alarms = Array.from({ length: 60 }, (_, idx) => ({
    id: idx + 1,
    at: base + (idx + 1) * 60_000,
    title: `Alarm ${idx + 1}`,
    body: 'Time!',
    reminderId: `rem-${idx + 1}`,
    habitId: `hab-${idx + 1}`,
    targetType: 'habit',
    isSnooze: false,
    isRecurring: true,
    timeStr: '08:00',
    daysOfWeek: 'Mon,Tue,Wed',
  }));

  // Deterministic shuffle
  const shuffled = [...alarms].sort((a, b) => Math.sin(a.id * 99) - Math.sin(b.id * 99));
  const kept = sortAndCap(shuffled);

  assert.equal(kept.length, 50);
  // First 50 timestamps should match sorted earliest 50
  const expectedIds = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.deepEqual(kept.map((a) => a.id), expectedIds);
  // Verify ascending chronological order
  for (let i = 1; i < kept.length; i++) {
    assert.ok(kept[i].at >= kept[i - 1].at);
  }
});

test('F-05 handles items missing .at or using schedule.at without returning NaN', () => {
  const base = 1700000000000;
  const mixed = [
    { id: 'late', at: base + 5000 },
    { id: 'missing-at' }, // no .at field -> pushed to end (MAX_SAFE_INTEGER)
    { id: 'schedule-at', schedule: { at: new Date(base + 1000) } },
    { id: 'earliest', at: base + 500 },
  ];
  const res = sortAndCap([...mixed]);
  assert.deepEqual(res.map((r) => r.id), ['earliest', 'schedule-at', 'late', 'missing-at']);
});

