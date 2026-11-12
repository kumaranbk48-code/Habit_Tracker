import test from 'node:test';
import assert from 'node:assert/strict';
import supabase from '../api/_routes/db-client.js';
import pushSendHandler from '../api/_routes/push-send.js';

function createMockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    end() { return this; },
  };
}

test('push-send pages reminders via .range() and queries push_subscriptions in chunks of 100 user IDs', async (t) => {
  const prevCron = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret-value';
  t.after(() => {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  // 650 reminders spanning 250 distinct user_ids (exceeds 500-row reminder page and 100-ID user chunk)
  const fakeReminders = Array.from({ length: 650 }, (_, idx) => ({
    id: `rem-${String(idx + 1).padStart(4, '0')}`,
    user_id: `user-${(idx % 250) + 1}`,
    reminder_time: '00:00',
    alerts: ['99:99'], // Non-matching time so webPush.sendNotification is not invoked
    notification_status: 'Active',
    target_type: 'habit',
    habits: { id: 'h-1', habit_name: 'Read' },
  }));

  const reminderRanges = [];
  const subChunkSizes = [];

  t.mock.method(supabase, 'from', (table) => {
    let rangeStart = null;
    let rangeEnd = null;
    let inUserIds = null;

    const chain = {
      select() { return chain; },
      eq() { return chain; },
      order() { return chain; },
      limit() {
        throw new Error('push-send must page via .range(), not fixed .limit()');
      },
      range(from, to) {
        rangeStart = from;
        rangeEnd = to;
        return chain;
      },
      in(col, vals) {
        if (table === 'push_subscriptions' && col === 'user_id') {
          inUserIds = vals;
          subChunkSizes.push(vals.length);
        }
        return chain;
      },
      then(resolve, reject) {
        if (table === 'reminders') {
          reminderRanges.push([rangeStart, rangeEnd]);
          const slice = fakeReminders.slice(rangeStart, rangeEnd + 1);
          return Promise.resolve({ data: slice, error: null }).then(resolve, reject);
        }
        if (table === 'push_subscriptions') {
          const rows = (inUserIds || []).map((uid) => ({
            user_id: uid,
            endpoint: `https://push.example/${uid}`,
            subscription: { endpoint: `https://push.example/${uid}`, keys: {} },
          }));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return chain;
  });

  const res = createMockRes();
  await pushSendHandler({
    method: 'POST',
    headers: { 'x-cron-secret': 'test-cron-secret-value' },
  }, res);

  assert.equal(res.statusCode, 200);
  // 650 reminders with page size 500 -> two .range() calls: [0, 499] and [500, 999]
  assert.deepEqual(reminderRanges, [[0, 499], [500, 999]]);
  // 250 user IDs chunked by <= 100 -> [100, 100, 50]
  assert.deepEqual(subChunkSizes, [100, 100, 50]);
  assert.ok(subChunkSizes.every((len) => len <= 100));
});
