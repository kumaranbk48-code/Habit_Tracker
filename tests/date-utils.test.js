import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTimeZone,
  getUserTimeZone,
  getDateInTimeZone,
  getDateDaysAgoInTimeZone,
  addDaysInTimeZone
} from '../api/_routes/date-utils.js';

describe('Timezone & Date Utilities', () => {
  test('isValidTimeZone: Correctly identifies valid and malformed timezones', () => {
    assert.equal(isValidTimeZone('UTC'), true);
    assert.equal(isValidTimeZone('America/New_York'), true);
    assert.equal(isValidTimeZone('Asia/Kolkata'), true);
    assert.equal(isValidTimeZone('Europe/London'), true);

    // Malicious or invalid values
    assert.equal(isValidTimeZone('Invalid/TZ'), false);
    assert.equal(isValidTimeZone(''), false);
    assert.equal(isValidTimeZone(null), false);
    assert.equal(isValidTimeZone('../etc/passwd'), false);
    assert.equal(isValidTimeZone('<script>'), false);
  });

  test('getUserTimeZone: Falls back safely to UTC if header or user profile is invalid', () => {
    assert.equal(getUserTimeZone({ headers: {} }, null), 'UTC');
    assert.equal(getUserTimeZone({ headers: { 'x-timezone': 'Asia/Tokyo' } }, null), 'Asia/Tokyo');
    assert.equal(getUserTimeZone({ headers: { 'x-timezone': 'bogus' } }, { user_metadata: { timezone: 'Europe/Paris' } }), 'Europe/Paris');
    assert.equal(getUserTimeZone({ headers: { 'x-timezone': 'bogus' } }, { user_metadata: { timezone: 'invalid' } }), 'UTC');
  });

  test('addDaysInTimeZone: Accurately adds days without off-by-one shifts', () => {
    const base = '2026-11-05';
    assert.equal(addDaysInTimeZone(base, 0, 'UTC'), '2026-11-05');
    assert.equal(addDaysInTimeZone(base, 1, 'UTC'), '2026-11-06');
    assert.equal(addDaysInTimeZone(base, 5, 'UTC'), '2026-11-10');
    assert.equal(addDaysInTimeZone(base, 30, 'UTC'), '2026-12-05');

    // Month boundary leap / transition
    assert.equal(addDaysInTimeZone('2026-02-28', 1, 'UTC'), '2026-03-01');
    assert.equal(addDaysInTimeZone('2026-12-31', 1, 'UTC'), '2027-01-01');
  });
});

