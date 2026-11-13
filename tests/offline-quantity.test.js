import test from 'node:test';
import assert from 'node:assert/strict';

test('Offline Quantity Support & Absolute Quantity Replay', async (t) => {
  // Simulate the tracking calculation logic as defined in api/_routes/tracking.js
  function calculateTracking({ habit, existing, body }) {
    const { status, action, amount, quantity_completed } = body;
    let newStatus = status !== undefined ? Boolean(status) : true;
    let newQuantity = existing?.quantity_completed || 0;

    if (habit.tracking_type === 'quantity') {
      const target = Number(habit.target_quantity) || 1;
      if (action === 'reset' || status === false) {
        newQuantity = 0;
        newStatus = false;
      } else if (action === 'complete' || (status === true && (amount === undefined || amount === null) && !action && quantity_completed === undefined)) {
        newQuantity = target;
        newStatus = true;
      } else if (action === 'set' || quantity_completed !== undefined) {
        const rawVal = action === 'set' && amount !== undefined ? amount : quantity_completed;
        const val = Number(rawVal);
        newQuantity = Number.isFinite(val) ? Math.max(0, val) : target;
        newStatus = newQuantity >= target;
      } else {
        const inc = Number(amount);
        if (Number.isFinite(inc)) {
          newQuantity = Math.max(0, newQuantity + inc);
        } else if (status === true) {
          newQuantity = target;
        }
        newStatus = newQuantity >= target;
      }
    }

    return { newQuantity, newStatus };
  }

  await t.test('Queue 3/8 for a quantity habit saves 3 and status false', () => {
    const habit = { id: 'h1', tracking_type: 'quantity', target_quantity: 8 };
    const res = calculateTracking({
      habit,
      existing: { quantity_completed: 0 },
      body: { habit_id: 'h1', action: 'set', amount: 3, quantity_completed: 3 },
    });
    assert.equal(res.newQuantity, 3);
    assert.equal(res.newStatus, false);
  });

  await t.test('Queue 8/8 for a quantity habit saves 8 and status true (marked done)', () => {
    const habit = { id: 'h1', tracking_type: 'quantity', target_quantity: 8 };
    const res = calculateTracking({
      habit,
      existing: { quantity_completed: 3 },
      body: { habit_id: 'h1', action: 'set', amount: 8, quantity_completed: 8 },
    });
    assert.equal(res.newQuantity, 8);
    assert.equal(res.newStatus, true);
  });

  await t.test('Queue reset / 0 for a quantity habit saves 0 and status false', () => {
    const habit = { id: 'h1', tracking_type: 'quantity', target_quantity: 8 };
    const res = calculateTracking({
      habit,
      existing: { quantity_completed: 8 },
      body: { habit_id: 'h1', action: 'set', amount: 0, quantity_completed: 0 },
    });
    assert.equal(res.newQuantity, 0);
    assert.equal(res.newStatus, false);
  });

  await t.test('Boolean habit toggles properly', () => {
    const habit = { id: 'h2', tracking_type: 'boolean' };
    const resTrue = calculateTracking({
      habit,
      existing: null,
      body: { habit_id: 'h2', status: true },
    });
    assert.equal(resTrue.newStatus, true);

    const resFalse = calculateTracking({
      habit,
      existing: null,
      body: { habit_id: 'h2', status: false },
    });
    assert.equal(resFalse.newStatus, false);
  });

  await t.test('Offline queue coalescing enforces last-value-wins for same habit/day', () => {
    // Simulate queue coalescing as in offlineDb.js computeIdempotencyKey & coalescing
    const queue = new Map();

    function enqueue(userId, habitId, date, payload) {
      const key = `${userId}:TRACK_HABIT:${habitId}:${date}`;
      const existing = queue.get(key);
      if (existing) {
        existing.payload = { ...existing.payload, ...payload };
      } else {
        queue.set(key, { key, payload });
      }
    }

    enqueue('user123', 'h1', '2026-11-13', { action: 'set', amount: 2, quantity_completed: 2 });
    enqueue('user123', 'h1', '2026-11-13', { action: 'set', amount: 5, quantity_completed: 5 });
    enqueue('user123', 'h1', '2026-11-13', { action: 'set', amount: 8, quantity_completed: 8, status: true });

    assert.equal(queue.size, 1, 'Coalesced into 1 queue item');
    const finalItem = queue.get('user123:TRACK_HABIT:h1:2026-11-13');
    assert.equal(finalItem.payload.quantity_completed, 8);
    assert.equal(finalItem.payload.status, true);
  });
});
