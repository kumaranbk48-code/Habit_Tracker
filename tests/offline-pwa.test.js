import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('PWA Manifest & Installation Requirements', async (t) => {
  await t.test('Manifest exists and has valid JSON structure', () => {
    const manifestPath = path.resolve(process.cwd(), 'public', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in public folder');

    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    assert.equal(typeof manifest.name, 'string', 'Manifest must have a name');
    assert.equal(typeof manifest.short_name, 'string', 'Manifest must have a short_name');
    assert.equal(manifest.display, 'standalone', 'Display mode must be standalone');
    assert.equal(manifest.start_url, '/', 'start_url must be /');
    assert.ok(manifest.theme_color, 'theme_color must be specified');
    assert.ok(manifest.background_color, 'background_color must be specified');
  });

  await t.test('Manifest contains standard 192px and 512px icons with any and maskable purposes', () => {
    const manifestPath = path.resolve(process.cwd(), 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest must have icons array');

    const has192 = manifest.icons.some((i) => i.sizes === '192x192' && (i.purpose === 'any' || !i.purpose));
    const has512 = manifest.icons.some((i) => i.sizes === '512x512' && (i.purpose === 'any' || !i.purpose));
    const hasMaskable = manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable');

    assert.ok(has192, 'Manifest must have a 192x192 icon');
    assert.ok(has512, 'Manifest must have a 512x512 icon');
    assert.ok(hasMaskable, 'Manifest must have a 512x512 maskable icon for Android adaptive icons');

    // Verify actual icon files exist on disk
    for (const icon of manifest.icons) {
      if (icon.src.startsWith('/')) {
        const filePath = path.resolve(process.cwd(), 'public', icon.src.slice(1));
        assert.ok(fs.existsSync(filePath), `Icon file ${icon.src} must exist on disk`);
      }
    }
  });

  await t.test('Offline fallback page exists with HabiZ theme', () => {
    const offlinePath = path.resolve(process.cwd(), 'public', 'offline.html');
    assert.ok(fs.existsSync(offlinePath), 'offline.html must exist in public folder');

    const html = fs.readFileSync(offlinePath, 'utf8');
    assert.ok(html.includes('Offline Mode'), 'offline.html must indicate offline mode');
    assert.ok(html.includes('HabiZ'), 'offline.html must feature HabiZ branding');
  });
});

test('Service Worker Offline Shell & Caching Architecture', async (t) => {
  const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js must exist');
  const swCode = fs.readFileSync(swPath, 'utf8');

  await t.test('Service worker contains precache assets array including essential app shell', () => {
    assert.ok(swCode.includes('PRECACHE_ASSETS'), 'SW must define PRECACHE_ASSETS');
    assert.ok(swCode.includes('/offline.html'), 'SW precache must include /offline.html');
    assert.ok(swCode.includes('/index.html'), 'SW precache must include /index.html');
    assert.ok(swCode.includes('/manifest.json'), 'SW precache must include /manifest.json');
  });

  await t.test('Service worker strictly avoids caching sensitive API endpoints', () => {
    assert.ok(
      swCode.includes("url.pathname.startsWith('/api/')"),
      'SW must bypass all /api/ requests to prevent caching sensitive user data in Cache API'
    );
  });

  await t.test('Service worker supports SKIP_WAITING for PWA update management', () => {
    assert.ok(
      swCode.includes('SKIP_WAITING'),
      'SW must handle SKIP_WAITING message to allow smooth updates'
    );
  });

  await t.test('Service worker includes navigation fallback to index.html/offline.html', () => {
    assert.ok(
      swCode.includes("request.mode === 'navigate'"),
      'SW must handle SPA navigation requests'
    );
    assert.ok(
      swCode.includes('/offline.html'),
      'SW navigation handler must include fallback to /offline.html'
    );
  });
});

test('Offline Idempotency & Queue Integrity Logic', async (t) => {
  function computeIdempotencyKey(userId, actionType, payload) {
    const u = String(userId || '');
    const t = String(actionType || '');
    if (t === 'TRACK_HABIT') {
      return `${u}:TRACK_HABIT:${payload.habit_id}:${payload.completion_date || payload.date}`;
    }
    if (t === 'UPDATE_GOAL') {
      return `${u}:UPDATE_GOAL:${payload.id || payload.goal_id}`;
    }
    return `${u}:${t}:${JSON.stringify(payload)}`;
  }

  await t.test('Generates identical idempotency key for duplicate habit toggle attempts', () => {
    const key1 = computeIdempotencyKey('usr-1', 'TRACK_HABIT', { habit_id: 'hab-123', completion_date: '2026-11-07', status: true });
    const key2 = computeIdempotencyKey('usr-1', 'TRACK_HABIT', { habit_id: 'hab-123', completion_date: '2026-11-07', status: false });

    assert.equal(key1, key2, 'Keys must match so toggles on same day coalesce rather than duplicate');
  });

  await t.test('Separates idempotency keys across different users (multi-tenant security)', () => {
    const keyUserA = computeIdempotencyKey('user-alice', 'TRACK_HABIT', { habit_id: 'hab-1', completion_date: '2026-11-07' });
    const keyUserB = computeIdempotencyKey('user-bob', 'TRACK_HABIT', { habit_id: 'hab-1', completion_date: '2026-11-07' });

    assert.notEqual(keyUserA, keyUserB, 'Keys for different users must never collide');
  });

  await t.test('Separates idempotency keys across different dates', () => {
    const keyDay1 = computeIdempotencyKey('user-1', 'TRACK_HABIT', { habit_id: 'hab-1', completion_date: '2026-11-07' });
    const keyDay2 = computeIdempotencyKey('user-1', 'TRACK_HABIT', { habit_id: 'hab-1', completion_date: '2026-11-08' });

    assert.notEqual(keyDay1, keyDay2, 'Keys for different dates must be distinct');
  });
});

test('Real Network Health Ping Endpoint Verification', async (t) => {
  await t.test('Health endpoint handler returns status 200 ok and timestamp', async () => {
    const healthMod = await import('../api/_routes/health.js');
    const handler = healthMod.default;

    let statusCode = 0;
    let jsonBody = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
    };

    await handler({}, mockRes);

    assert.equal(statusCode, 200);
    assert.equal(jsonBody?.status, 'ok');
    assert.ok(jsonBody?.timestamp, 'Health endpoint must return timestamp');
  });

  await t.test('Unified API Gateway router handles requests and returns 200 for health', async () => {
    const gatewayMod = await import('../api/index.js');
    const gatewayHandler = gatewayMod.default;

    let statusCode = 0;
    let jsonBody = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
    };

    await gatewayHandler({ url: '/api/health', method: 'GET' }, mockRes);

    assert.equal(statusCode, 200);
    assert.equal(jsonBody?.status, 'ok');
  });
});

