/**
 * HabiZ — Error-handling test suite
 * Run:  node --test tests/error-handling.test.js
 *
 * Boots the REAL server.js on a random port (dummy env, no network needed) and checks
 * how the app behaves when things go wrong: 404, 401, 413, 429, bad JSON, bad routes.
 * Tests tagged [KNOWN BUG] FAIL today by design — they pin the defects found in the
 * audit and will turn green once the defect is fixed. Do not weaken them.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');
const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', // never reachable
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      CRON_SECRET: 'test-cron-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start in 8s')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Server running')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error(`server exited early (${c})`)));
  });
});

after(() => { try { proc?.kill(); } catch { /* ignore */ } });

const req = (p, init) => fetch(BASE + p, { signal: AbortSignal.timeout(5000), ...init });

describe('API: status codes & JSON error shape', () => {
  test('unknown /api route -> 404 JSON (never HTML)', async () => {
    const r = await req('/api/does-not-exist');
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.ok((await r.json()).error);
  });

  test('protected route without token -> 401 JSON', async () => {
    const r = await req('/api/habits');
    assert.equal(r.status, 401);
    assert.match(r.headers.get('content-type'), /application\/json/);
  });

  test('protected route with garbage token -> 401 JSON, no internals leaked', async () => {
    const r = await req('/api/habits', { headers: { Authorization: 'Bearer not-a-real-token' } });
    assert.equal(r.status, 401);
    const text = await r.text();
    assert.doesNotMatch(text, /node_modules|\/home\/|at .*\(.*:\d+:\d+\)/);
  });

  test('cron endpoints reject wrong or missing secret -> 401', async () => {
    for (const p of ['/api/digest?secret=wrong', '/api/push-send']) {
      assert.equal((await req(p)).status, 401, p);
    }
  });

  test('body over 100kb -> 413 JSON', async () => {
    const r = await req('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'x'.repeat(200_000) }),
    });
    assert.equal(r.status, 413);
    assert.match(r.headers.get('content-type'), /application\/json/);
  });

  test('CORS: disallowed origin gets no Allow-Origin header', async () => {
    const r = await req('/api/habits', { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  test('/api/health -> 200 ok', async () => {
    const r = await req('/api/health');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, 'ok');
  });
});

describe('[KNOWN BUG] API: malformed input & leaks', () => {
  test('malformed JSON body -> 400 JSON (server.js:~206 has no parse-error handler)', async () => {
    const r = await req('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(r.status, 400);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/, 'got HTML instead of JSON');
  });

  test('malformed JSON response must not leak stack traces or file paths', async () => {
    const r = await req('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const text = await r.text();
    assert.doesNotMatch(text, /node_modules|\/home\/|\\Users\\|at JSON\.parse/);
  });

  test('POST to an unknown non-API path must not return Express HTML "Cannot POST"', async () => {
    const r = await req('/random-path', { method: 'POST' });
    assert.doesNotMatch(await r.text(), /Cannot POST/);
  });
});

describe('[KNOWN BUG] Rate limiting', () => {
  test('429 is returned after 120 requests from one client', async () => {
    let got429 = false;
    for (let i = 0; i < 160 && !got429; i++) {
      const r = await req('/api/does-not-exist', { headers: { 'X-Forwarded-For': '9.9.9.9' } });
      if (r.status === 429) got429 = true;
    }
    assert.ok(got429, 'limiter never triggered');
  });

  test('spoofing X-Forwarded-For must NOT bypass the limiter (server.js:~144)', async () => {
    let got429 = false;
    for (let i = 0; i < 200 && !got429; i++) {
      const r = await req('/api/does-not-exist', { headers: { 'X-Forwarded-For': `10.1.${i >> 8}.${i & 255}` } });
      if (r.status === 429) got429 = true;
    }
    assert.ok(got429, 'attacker rotates fake IPs and is never limited');
  });
});

describe('Frontend: 404 page & crash screen (static checks)', () => {
  test('router has a catch-all "*" route rendering NotFound', () => {
    const app = read('src/App.tsx');
    assert.match(app, /<Route path="\*" element={<NotFound \/>} \/>/);
  });

  test('NotFound shows a 404 message and a link home', () => {
    const nf = read('src/pages/NotFound.jsx');
    assert.match(nf, /Page Not Found/);
    assert.match(nf, /to="\/"/);
  });

  test('App is wrapped in an ErrorBoundary', () => {
    assert.match(read('src/App.tsx'), /<ErrorBoundary>/);
  });

  test('[KNOWN BUG] ErrorBoundary must not show raw error.message to users in production', () => {
    const eb = read('src/components/ErrorBoundary.jsx');
    const showsRaw = /\{this\.state\.error\?\.message/.test(eb);
    const gated = /import\.meta\.env\.DEV/.test(eb);
    assert.ok(!showsRaw || gated, 'raw error.message rendered without a DEV-only guard');
  });

  test('[KNOWN BUG] global handlers exist for unhandled promise rejections / window errors', () => {
    const main = read('src/main.tsx');
    assert.match(main, /unhandledrejection/);
  });
});

describe('[KNOWN BUG] Offline sync error classification (src/lib/syncManager.js)', () => {
  test('401 and 429 must be retryable, not permanently "failed"', () => {
    const src = read('src/lib/syncManager.js');
    const retryable = /(401|429|408)/.test(src.split('status >= 400')[0] + (src.split('status >= 400')[1] ?? '').slice(0, 400));
    assert.ok(retryable, 'all 4xx are marked permanently failed, including expired-token 401 and rate-limit 429');
  });
});

describe('[KNOWN BUG] Production config (vercel.json)', () => {
  test('security headers are configured for the Vercel deployment', () => {
    const v = JSON.parse(read('vercel.json'));
    assert.ok(Array.isArray(v.headers) && v.headers.length > 0, 'vercel.json has no "headers" block; server.js headers do not apply on Vercel');
  });

  test('missing static assets must not be rewritten to index.html with 200', () => {
    const v = JSON.parse(read('vercel.json'));
    const spa = v.rewrites.find((r) => r.destination === '/index.html');
    assert.ok(/assets/.test(spa.source), 'catch-all rewrite also swallows /assets/* (stale chunks return HTML as JS)');
  });
});

describe('[KNOWN BUG] Frontend: silent failures on non-2xx responses', () => {
  test('no "if (res.ok) { ... }" block may lack an else/toast branch', () => {
    const files = [
      'src/pages/Habits.jsx', 'src/pages/Dashboard.jsx', 'src/pages/Reminders.jsx',
      'src/pages/LearningHubDashboard.jsx', 'src/pages/LearningJourneyDetail.jsx',
      'src/components/SeasonManagerModal.jsx',
    ].filter((f) => existsSync(path.join(ROOT, f)));
    let silent = 0;
    for (const f of files) {
      const s = read(f);
      for (const m of s.matchAll(/if \((?:res|response)\.ok\) \{/g)) {
        let i = m.index + m[0].length, d = 1;
        while (i < s.length && d > 0) { if (s[i] === '{') d++; else if (s[i] === '}') d--; i++; }
        if (!/^\s*else/.test(s.slice(i, i + 30))) silent++;
      }
    }
    assert.equal(silent, 0, `${silent} fetch handlers swallow 4xx/5xx with no user feedback`);
  });
});