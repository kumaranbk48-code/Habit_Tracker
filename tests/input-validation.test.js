import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Input Validation & Boundary Rules', () => {
  test('Habit Name Constraints: Must be 1-150 characters and not blank', () => {
    function validateHabitName(name) {
      if (!name || typeof name !== 'string') return false;
      const trimmed = name.trim();
      return trimmed.length >= 1 && trimmed.length <= 150;
    }

    assert.equal(validateHabitName('Drink 2L Water'), true);
    assert.equal(validateHabitName(''), false);
    assert.equal(validateHabitName('   '), false);
    assert.equal(validateHabitName(null), false);
    assert.equal(validateHabitName('A'.repeat(150)), true);
    assert.equal(validateHabitName('A'.repeat(151)), false);
  });

  test('Milestone Title Constraints: Must be 1-200 characters', () => {
    function validateMilestoneTitle(title) {
      if (!title || typeof title !== 'string') return false;
      const trimmed = title.trim();
      return trimmed.length >= 1 && trimmed.length <= 200;
    }

    assert.equal(validateMilestoneTitle('Read chapter 1'), true);
    assert.equal(validateMilestoneTitle(''), false);
    assert.equal(validateMilestoneTitle('   '), false);
    assert.equal(validateMilestoneTitle('M'.repeat(200)), true);
    assert.equal(validateMilestoneTitle('M'.repeat(201)), false);
  });

  test('Quantity Habit Parameters: Requires positive target and non-empty unit', () => {
    function validateQuantityParams(trackingType, targetQty, unit) {
      if (trackingType !== 'quantity') return { valid: true };
      const num = Number(targetQty);
      if (!Number.isFinite(num) || num <= 0) {
        return { valid: false, error: 'target_quantity must be positive number' };
      }
      if (!unit || !String(unit).trim()) {
        return { valid: false, error: 'unit is required' };
      }
      return { valid: true };
    }

    assert.equal(validateQuantityParams('boolean', null, null).valid, true);
    assert.equal(validateQuantityParams('quantity', 5, 'km').valid, true);
    assert.equal(validateQuantityParams('quantity', 0, 'pages').valid, false);
    assert.equal(validateQuantityParams('quantity', -2, 'liters').valid, false);
    assert.equal(validateQuantityParams('quantity', 'invalid', 'hours').valid, false);
    assert.equal(validateQuantityParams('quantity', 10, '').valid, false);
    assert.equal(validateQuantityParams('quantity', 10, '   ').valid, false);
  });

  test('Avatar Image MIME Type Validation: Only allows jpeg, png, webp', () => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    assert.equal(ALLOWED_TYPES.includes('image/jpeg'), true);
    assert.equal(ALLOWED_TYPES.includes('image/png'), true);
    assert.equal(ALLOWED_TYPES.includes('image/webp'), true);

    // Disallowed dangerous types
    assert.equal(ALLOWED_TYPES.includes('image/svg+xml'), false);
    assert.equal(ALLOWED_TYPES.includes('text/html'), false);
    assert.equal(ALLOWED_TYPES.includes('application/javascript'), false);
    assert.equal(ALLOWED_TYPES.includes('application/x-executable'), false);
  });
});

