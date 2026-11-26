import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;

  const res = {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      body = data;
      ended = true;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
  };

  return res;
}

function setupBrowserGlobals({ onLine = true, fetchImpl }) {
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch,
    CustomEvent: globalThis.CustomEvent,
  };

  const dispatchedEvents = [];
  const winListeners = {};
  const docListeners = {};

  globalThis.CustomEvent = class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  globalThis.window = {
    addEventListener(type, cb) {
      (winListeners[type] ||= []).push(cb);
    },
    removeEventListener(type, cb) {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter((f) => f !== cb);
    },
    dispatchEvent(evt) {
      dispatchedEvents.push(evt);
      for (const cb of winListeners[evt.type] || []) cb(evt);
      return true;
    },
  };

  globalThis.document = {
    visibilityState: 'visible',
    addEventListener(type, cb) {
      (docListeners[type] ||= []).push(cb);
    },
    removeEventListener(type, cb) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter((f) => f !== cb);
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine },
    configurable: true,
    writable: true,
  });

  globalThis.fetch = fetchImpl;

  const restore = () => {
    if (orig.window === undefined) delete globalThis.window;
    else globalThis.window = orig.window;
    if (orig.document === undefined) delete globalThis.document;
    else globalThis.document = orig.document;
    if (orig.navigator) Object.defineProperty(globalThis, 'navigator', orig.navigator);
    else delete globalThis.navigator;
    globalThis.fetch = orig.fetch;
    if (orig.CustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = orig.CustomEvent;
  };

  return { dispatchedEvents, restore };
}

test('API CORS & Health Route Preflight Handling', async (t) => {
  await t.test('cors.js allows X-Client-Idempotency-Key alongside existing headers', async () => {
    const { applyCors } = await import('../api/_routes/cors.js');
    const res = createMockRes();
    const handled = applyCors(
      { method: 'GET', headers: { origin: 'https://localhost' } },
      res
    );

    assert.equal(handled, false);
    assert.equal(res.headers['access-control-allow-origin'], 'https://localhost');
    const allowHeaders = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.ok(allowHeaders.includes('x-client-idempotency-key'), 'Missing x-client-idempotency-key');
    assert.ok(allowHeaders.includes('authorization'));
    assert.ok(allowHeaders.includes('content-type'));
    assert.ok(allowHeaders.includes('x-timezone'));
    assert.ok(allowHeaders.includes('x-cron-secret'));
  });

  await t.test('health.js returns CORS headers for Origin https://localhost and handles OPTIONS with 204', async () => {
    const { default: healthHandler } = await import('../api/_routes/health.js');

    const optRes = createMockRes();
    await healthHandler(
      { method: 'OPTIONS', headers: { origin: 'https://localhost' }, query: {} },
      optRes
    );
    assert.equal(optRes.statusCode, 204);
    assert.equal(optRes.ended, true);
    assert.equal(optRes.headers['access-control-allow-origin'], 'https://localhost');
    assert.ok(
      String(optRes.headers['access-control-allow-headers'] || '').toLowerCase().includes('x-client-idempotency-key')
    );

    const getRes = createMockRes();
    await healthHandler(
      { method: 'GET', headers: { origin: 'https://localhost' }, query: { lite: '1' } },
      getRes
    );
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.body?.status, 'ok');
    assert.equal(getRes.body?.db, 'skipped_lite');
    assert.equal(getRes.headers['access-control-allow-origin'], 'https://localhost');
    assert.ok(String(getRes.headers['cache-control'] || '').includes('no-store'));
  });

  await t.test('api/index.js applies CORS and 204 preflight before routing for health and other routes', async () => {
    const { default: gatewayHandler } = await import('../api/index.js');

    const healthOptRes = createMockRes();
    await gatewayHandler(
      { url: '/api/health?lite=1', method: 'OPTIONS', headers: { origin: 'https://localhost' } },
      healthOptRes
    );
    assert.equal(healthOptRes.statusCode, 204);
    assert.equal(healthOptRes.headers['access-control-allow-origin'], 'https://localhost');

    const unknownOptRes = createMockRes();
    await gatewayHandler(
      { url: '/api/nonexistent', method: 'OPTIONS', headers: { origin: 'https://localhost' } },
      unknownOptRes
    );
    assert.equal(unknownOptRes.statusCode, 204);
    assert.equal(unknownOptRes.headers['access-control-allow-origin'], 'https://localhost');

    const healthGetRes = createMockRes();
    await gatewayHandler(
      { url: '/api/health?lite=1', method: 'GET', headers: { origin: 'https://localhost' } },
      healthGetRes
    );
    assert.equal(healthGetRes.statusCode, 200);
    assert.equal(healthGetRes.headers['access-control-allow-origin'], 'https://localhost');
  });
});

test('networkStatus.js Connectivity Detection, Retries & Events', async (t) => {
  await t.test('startup ping runs automatically on module load and verifies online state', async () => {
    let fetchCalls = 0;
    const requestedUrls = [];
    const env = setupBrowserGlobals({
      onLine: true,
      fetchImpl: async (url) => {
        fetchCalls++;
        requestedUrls.push(String(url));
        return { ok: true, status: 200 };
      },
    });

    try {
      const mod = await import(`../src/lib/networkStatus.js?case=startup-${Date.now()}`);
      await new Promise((r) => setTimeout(r, 15));

      assert.ok(fetchCalls >= 1, 'Expected startup ping on module load');
      assert.ok(requestedUrls[0].startsWith('/api/health?lite=1'));
      assert.equal(mod.getOnlineStatus(), true);
      assert.equal(mod.getConnectionDetail(), 'online');
    } finally {
      env.restore();
    }
  });

  await t.test('verifyServerReachability success returns true and online detail', async () => {
    const env = setupBrowserGlobals({
      onLine: true,
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });

    try {
      const mod = await import(`../src/lib/networkStatus.js?case=success-${Date.now()}`);
      await new Promise((r) => setTimeout(r, 15));

      const ok = await mod.verifyServerReachability({ retryDelayMs: 0 });
      assert.equal(ok, true);
      assert.equal(mod.getOnlineStatus(), true);
      assert.equal(mod.getConnectionDetail(), 'online');
    } finally {
      env.restore();
    }
  });

  await t.test('retry-once behavior recovers from a single flaky fetch error without flipping offline', async () => {
    let calls = 0;
    let shouldFlake = false;
    const env = setupBrowserGlobals({
      onLine: true,
      fetchImpl: async () => {
        calls++;
        if (shouldFlake && calls === 2) {
          throw new TypeError('Transient failure');
        }
        return { ok: true, status: 200 };
      },
    });

    try {
      const mod = await import(`../src/lib/networkStatus.js?case=retry-${Date.now()}`);
      await new Promise((r) => setTimeout(r, 15)); // startup call 1 succeeds

      shouldFlake = true;
      const beforeEvents = env.dispatchedEvents.length;
      const ok = await mod.verifyServerReachability({ retryDelayMs: 5 });

      assert.equal(calls, 3, 'Expected startup + attempt1 (throw) + retry (200)');
      assert.equal(ok, true);
      assert.equal(mod.getOnlineStatus(), true);
      assert.equal(mod.getConnectionDetail(), 'online');
      assert.equal(
        env.dispatchedEvents.slice(beforeEvents).filter((e) => e.detail?.isOnline === false).length,
        0,
        'Single flaky failure must never emit offline'
      );
    } finally {
      env.restore();
    }
  });

  await t.test('thrown fetch twice sets offline state, emits connectivity event, and offline->online fires habiz-connectivity-status', async () => {
    let failAll = false;
    const env = setupBrowserGlobals({
      onLine: true,
      fetchImpl: async () => {
        if (failAll) {
          throw new TypeError('Failed to fetch');
        }
        return { ok: true, status: 200 };
      },
    });

    try {
      const mod = await import(`../src/lib/networkStatus.js?case=twice-${Date.now()}`);
      await new Promise((r) => setTimeout(r, 15));

      failAll = true;
      const offlineOk = await mod.verifyServerReachability({ retryDelayMs: 5 });
      assert.equal(offlineOk, false);
      assert.equal(mod.getOnlineStatus(), false);
      assert.equal(mod.getConnectionDetail(), 'server_unavailable');
      assert.ok(
        env.dispatchedEvents.some((e) => e.type === 'habiz-connectivity-status' && e.detail?.isOnline === false)
      );

      // Now recover -> offline -> online must dispatch habiz-connectivity-status with isOnline: true
      failAll = false;
      const recoveredOk = await mod.verifyServerReachability({ retryDelayMs: 5 });
      assert.equal(recoveredOk, true);
      assert.equal(mod.getOnlineStatus(), true);
      assert.equal(mod.getConnectionDetail(), 'online');
      assert.ok(
        env.dispatchedEvents.some((e) => e.type === 'habiz-connectivity-status' && e.detail?.isOnline === true)
      );
    } finally {
      env.restore();
    }
  });

  await t.test('HTTP 500 sets server_unavailable detail without labeling phone offline or blocking sync', async () => {
    let statusToReturn = 200;
    const env = setupBrowserGlobals({
      onLine: true,
      fetchImpl: async () => ({ ok: false, status: statusToReturn }),
    });

    try {
      const mod = await import(`../src/lib/networkStatus.js?case=500-${Date.now()}`);
      await new Promise((r) => setTimeout(r, 15));

      statusToReturn = 500;
      const ok = await mod.verifyServerReachability({ retryDelayMs: 0 });

      assert.equal(ok, true, 'HTTP 500 proves network works and must not block sync');
      assert.equal(mod.getOnlineStatus(), true, 'Must not mark working phone offline on 500');
      assert.notEqual(mod.getConnectionDetail(), 'device_offline');
      assert.equal(mod.getConnectionDetail(), 'server_unavailable');
    } finally {
      env.restore();
    }
  });
});

test('OfflineStatusBanner feedback & recovery contracts', () => {
  const bannerSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'OfflineStatusBanner.jsx'),
    'utf8'
  );
  assert.ok(bannerSrc.includes('getConnectionDetail'), 'Banner must consult getConnectionDetail()');
  assert.ok(bannerSrc.includes('Checking...'), 'Banner must show Checking... while probing');
  assert.ok(bannerSrc.includes("'Connected'"), 'Banner must show Connected on manual check success');
  assert.ok(
    bannerSrc.includes('No internet connection') && bannerSrc.includes('Server unreachable'),
    'Banner must distinguish device offline vs server unreachable messages'
  );
  assert.ok(
    bannerSrc.includes('if (isNative)') && bannerSrc.includes('triggerSync()'),
    'Banner recovery must call triggerSync() on native platform only'
  );
  assert.ok(
    bannerSrc.includes('habittracker-stats-updated'),
    'Banner recovery must dispatch habittracker-stats-updated to refetch page data'
  );
});
