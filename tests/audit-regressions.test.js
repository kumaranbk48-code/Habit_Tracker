/**
 * HabiZ — Audit regression tests (static checks)
 * Run:  node --test tests/audit-regressions.test.js
 * Every test here FAILS today and pins a finding from AUDIT_REPORT.md (ID in the title).
 * When the finding is fixed properly the test turns green. Do not weaken or delete tests.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');
const ALARM_DIR = 'android/app/src/main/java/com/habiz/app/alarm';
const alarmFiles = () => readdirSync(path.join(ROOT, ALARM_DIR)).filter((f) => f.endsWith('.kt'));

describe('Auth', () => {
  test('F-01 password recovery: app actually lets the user set a new password', () => {
    const files = ['src/pages/Login.jsx', 'src/contexts/AuthContext.jsx', 'src/App.tsx'].map(read).join('\n');
    assert.match(files, /updateUser\(\s*\{\s*password/, 'no code ever calls updateUser({ password }) — reset link is a dead end');
    assert.match(files, /PASSWORD_RECOVERY|mode=recovery|get\(['"]mode['"]\)/, 'recovery redirect (?mode=recovery) is never read');
  });
  test('F-02 minimum password length is at least 8 (Login.jsx)', () => {
    const m = read('src/pages/Login.jsx').match(/minLength=\{isSignUp \? (\d+)/);
    assert.ok(m && Number(m[1]) >= 8, `minLength is ${m?.[1]}`);
  });
});

describe('Navigation (404s)', () => {
  test('F-03 notification click targets must be real routes (no /dashboard)', () => {
    for (const f of ['public/sw.js', 'api/_routes/push-send.js']) {
      assert.doesNotMatch(read(f), /['"`]\/dashboard['"`]/, `${f} sends users to /dashboard, which renders the 404 page`);
    }
  });
});

describe('Android native layer', () => {
  test('F-04 manifest forbids cleartext HTTP and app-data backup', () => {
    const m = read('android/app/src/main/AndroidManifest.xml');
    assert.doesNotMatch(m, /usesCleartextTraffic="true"/);
    assert.doesNotMatch(m, /allowBackup="true"/);
  });
  test('F-04 capacitor.config.ts has no cleartext / mixed content', () => {
    const c = read('capacitor.config.ts');
    assert.doesNotMatch(c, /cleartext:\s*true/);
    assert.doesNotMatch(c, /allowMixedContent:\s*true/);
  });
  test('F-05 JS sorts alarms by time BEFORE the 50-alarm cap (nativeNotifications.js)', () => {
    const s = read('src/lib/nativeNotifications.js');
    const i = s.indexOf('nativeAlarms.slice(0, 50)');
    assert.ok(i > -1, 'cap not found');
    assert.match(s.slice(Math.max(0, i - 400), i), /\.sort\(/, 'list is capped without sorting: soonest alarms can be dropped');
  });
  test('F-06 alarms keep working if the app is not opened for >7 days (next occurrence rescheduled natively)', () => {
    const all = alarmFiles().map((f) => read(`${ALARM_DIR}/${f}`)).join('\n');
    assert.match(all, /WorkManager|rescheduleNext|scheduleNextOccurrence/, 'AlarmReceiver never schedules the next occurrence; JS only schedules 7 days ahead');
  });
  test('F-07 snooze alarm ids cannot collide within the same second', () => {
    assert.doesNotMatch(read(`${ALARM_DIR}/AlarmActionReceiver.kt`), /currentTimeMillis\(\)\s*\/\s*1000\)\s*%/);
  });
  test('F-08 date keys use Locale.US/ROOT, not Locale.getDefault()', () => {
    for (const f of alarmFiles()) {
      assert.doesNotMatch(read(`${ALARM_DIR}/${f}`), /SimpleDateFormat\("yyyy-MM-dd",\s*Locale\.getDefault\(\)\)/, f);
    }
  });
});

describe('Backend data safety', () => {
  test('F-09 learning connect_habit verifies journey AND habit ownership', () => {
    const s = read('api/_routes/learning.js');
    const block = s.slice(s.indexOf("action === 'connect_habit'"), s.indexOf("action === 'connect_habit'") + 900);
    assert.match(block, /from\('habits'\)/, 'habit_id is not checked to belong to the user');
    assert.match(block, /from\('learning_journeys'\)/, 'journey_id is not checked to belong to the user');
  });
  test('F-10 seasons API never silently falls back to local-disk storage', () => {
    assert.doesNotMatch(read('api/_routes/seasons.js'), /seasons-storage/, 'data written to ephemeral serverless disk is lost');
  });
  test('F-11 account DELETE does not report success when deletion failed', () => {
    const s = read('api/_routes/account.js');
    const del = s.slice(s.indexOf("req.method === 'DELETE'"));
    assert.match(del, /deleteUserErr[\s\S]{0,200}(status\(500\)|status\(502\)|throw)/, 'auth deletion error is only logged, user still told "permanently deleted"');
  });
  test('F-12 account export reports failed sections instead of returning silent empty arrays', () => {
    assert.match(read('api/_routes/account.js'), /Res\.error/, 'query errors are never inspected');
  });
});

describe('Performance', () => {
  test('F-13 vite.config.ts does not force PDF libs into an eagerly-loaded chunk', () => {
    assert.doesNotMatch(read('vite.config.ts'), /return 'vendor-pdf'/, 'vendor-pdf (177 kB gz) is preloaded on every first load incl. Login');
  });
});