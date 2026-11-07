import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isOriginAllowed } from '../api/cors.js';
import { verifyUserToken } from '../api/auth-helper.js';

describe('Security & Authentication Controls', () => {
  test('Token Verification: Rejects empty or invalid token types', async () => {
    const res1 = await verifyUserToken('');
    assert.equal(res1.user, null);
    assert.match(res1.error, /No token provided/i);

    const res2 = await verifyUserToken(null);
    assert.equal(res2.user, null);
    assert.match(res2.error, /No token provided/i);

    const res3 = await verifyUserToken(12345);
    assert.equal(res3.user, null);
    assert.match(res3.error, /No token provided/i);
  });

  test('CORS: Strict allowlist prevents unauthorized origins', () => {
    // Valid origins
    assert.equal(isOriginAllowed('http://localhost:5173'), true);
    assert.equal(isOriginAllowed('http://localhost:3000'), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:5173'), true);

    // Malicious or unauthorized origins
    assert.equal(isOriginAllowed('https://evil-attacker.com'), false);
    assert.equal(isOriginAllowed('http://localhost:5173.evil.com'), false);
    assert.equal(isOriginAllowed('null'), false);
    assert.equal(isOriginAllowed(''), false);
    assert.equal(isOriginAllowed(null), false);
  });

  test('Cron Secret Timing-Safe Comparison: Compares equal buffers safely', () => {
    function safeCompare(a, b) {
      if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    }

    const realSecret = 'super_secure_cron_secret_12345';
    assert.equal(safeCompare(realSecret, realSecret), true);
    assert.equal(safeCompare('wrong_secret', realSecret), false);
    assert.equal(safeCompare('', realSecret), false);
    assert.equal(safeCompare(null, realSecret), false);
    assert.equal(safeCompare(undefined, realSecret), false);
  });
});

