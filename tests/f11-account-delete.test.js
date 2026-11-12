import test from 'node:test';
import assert from 'node:assert/strict';
import supabase from '../api/_routes/db-client.js';
import handler from '../api/_routes/account.js';

function createMockRes() {
  const headers = {};
  return {
    statusCode: null,
    jsonBody: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonBody = data;
      return this;
    }
  };
}

test('F-11 account DELETE recent-login check', async (t) => {
  await t.test('returns 403 when user.last_sign_in_at is older than 15 minutes', async () => {
    t.mock.method(supabase.auth, 'getUser', async () => ({
      data: {
        user: {
          id: 'user-old-login',
          last_sign_in_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
        }
      },
      error: null
    }));

    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer mock-token' }
    };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.jsonBody.error, /Recent authentication required/);
  });

  await t.test('reaches table deletion code when user.last_sign_in_at is fresh (<15 mins)', async () => {
    t.mock.method(supabase.auth, 'getUser', async () => ({
      data: {
        user: {
          id: 'user-fresh-login',
          last_sign_in_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 mins ago (fresh)
        }
      },
      error: null
    }));

    let deletedTable = null;
    t.mock.method(supabase, 'from', (table) => {
      deletedTable = table;
      return {
        delete: () => ({
          eq: async () => ({ error: { message: 'simulated halt after reaching delete' } })
        })
      };
    });

    const req = {
      method: 'DELETE',
      headers: { authorization: 'Bearer mock-token' }
    };
    const res = createMockRes();

    await handler(req, res);
    // Verified: passed recent login check and reached first table deletion ('learning_practice_logs')
    assert.equal(deletedTable, 'learning_practice_logs');
    assert.equal(res.statusCode, 500);
    assert.match(res.jsonBody.error, /Failed to delete account data from learning_practice_logs/);
  });
});
