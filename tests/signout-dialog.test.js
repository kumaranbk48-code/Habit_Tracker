import test from 'node:test';
import assert from 'node:assert/strict';

test('Sign-Out Confirmation & Unsynced Offline Accounting', async (t) => {
  function computeUnsyncedTotal(stats, queueReadFailed = false) {
    if (queueReadFailed) {
      return { total: -1, isUnknown: true, shouldWarn: true };
    }
    const pending = stats?.pending || 0;
    const syncing = stats?.syncing || 0;
    const failed = stats?.failed || 0;
    const stuck = stats?.stuck || 0;
    const total = pending + syncing + failed + stuck;
    return {
      total,
      pending,
      syncing,
      failed,
      stuck,
      isUnknown: false,
      shouldWarn: total > 0,
    };
  }

  await t.test('Warning accurately counts pending + syncing + failed + stuck', () => {
    const stats = { pending: 3, syncing: 1, failed: 2, stuck: 4, total: 10 };
    const res = computeUnsyncedTotal(stats, false);

    assert.equal(res.total, 10);
    assert.equal(res.shouldWarn, true);
    assert.equal(res.pending, 3);
    assert.equal(res.syncing, 1);
    assert.equal(res.failed, 2);
    assert.equal(res.stuck, 4);
  });

  await t.test('Queue-read failure is treated as unsafe (not zero)', () => {
    const res = computeUnsyncedTotal(null, true);

    assert.equal(res.shouldWarn, true, 'Queue-read failure must produce a data-loss warning');
    assert.equal(res.isUnknown, true);
  });

  await t.test('Clean session with 0 unsynced items shows standard confirm without data loss warning', () => {
    const stats = { pending: 0, syncing: 0, failed: 0, stuck: 0, total: 0 };
    const res = computeUnsyncedTotal(stats, false);

    assert.equal(res.total, 0);
    assert.equal(res.shouldWarn, false);
  });
});
