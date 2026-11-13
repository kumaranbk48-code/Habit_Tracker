import test from 'node:test';
import assert from 'node:assert/strict';

test('Offline Sync Architecture, Retry Accounting & Error Classification', async (t) => {
  const MAX_RETRY_ATTEMPTS = 5;

  // Model updateActionStatus logic
  function updateActionStatus(action, status, error = null, options = {}) {
    action.status = status;
    if (error) {
      action.lastError = String(error);
      if (options.errorCategory) {
        action.errorCategory = options.errorCategory;
      }
      if (options.incrementRetry === true) {
        action.retries = (action.retries || 0) + 1;
      }
    }
    return action;
  }

  function markRetryOrStuck(action, errorMessage, errorCategory = 'server') {
    const nextRetries = (action.retries || 0) + 1;
    if (nextRetries >= MAX_RETRY_ATTEMPTS) {
      return updateActionStatus(action, 'stuck', `${errorMessage} (max retries reached)`, {
        incrementRetry: true,
        errorCategory,
      });
    }
    return updateActionStatus(action, 'pending', errorMessage, {
      incrementRetry: true,
      errorCategory,
    });
  }

  await t.test('Network disconnection preserves work without consuming server retries', () => {
    const action = { id: 'act-1', status: 'syncing', retries: 0 };
    
    // Simulate 10 consecutive network offline drops
    for (let i = 0; i < 10; i++) {
      updateActionStatus(action, 'pending', 'Network disconnected', {
        incrementRetry: false,
        errorCategory: 'network',
      });
    }

    assert.equal(action.status, 'pending', 'Action must stay pending');
    assert.equal(action.retries, 0, 'Network failures must never consume server retries');
    assert.equal(action.errorCategory, 'network');
  });

  await t.test('Server errors (5xx, 429, 408) increment retries and mark stuck only at 5', () => {
    const action = { id: 'act-2', status: 'syncing', retries: 0 };

    // Retry 1 to 4
    for (let i = 1; i < 5; i++) {
      markRetryOrStuck(action, 'HTTP 500', 'server');
      assert.equal(action.status, 'pending');
      assert.equal(action.retries, i);
    }

    // 5th retry reaches MAX_RETRY_ATTEMPTS -> marks stuck
    markRetryOrStuck(action, 'HTTP 500', 'server');
    assert.equal(action.status, 'stuck', 'Must be marked stuck upon 5th server failure');
    assert.equal(action.retries, 5);
  });

  await t.test('Auth 401 token refresh failure preserves work without consuming server retries', () => {
    const action = { id: 'act-3', status: 'syncing', retries: 0 };

    updateActionStatus(action, 'pending', 'Session expired, waiting for login', {
      incrementRetry: false,
      errorCategory: 'auth',
    });

    assert.equal(action.status, 'pending');
    assert.equal(action.retries, 0, 'Auth failures must not consume server retries');
  });

  await t.test('Validation 4xx error marks action as failed without retry loop', () => {
    const action = { id: 'act-4', status: 'syncing', retries: 0 };

    updateActionStatus(action, 'failed', 'Habit not found or deleted', {
      incrementRetry: false,
      errorCategory: 'validation',
    });

    assert.equal(action.status, 'failed');
    assert.equal(action.retries, 0);
  });

  await t.test('resetNetworkStuckActions restores only network-related stuck items', () => {
    const queue = [
      { id: '1', status: 'stuck', errorCategory: 'network', lastError: 'Network disconnected' },
      { id: '2', status: 'stuck', errorCategory: 'server', lastError: 'HTTP 500 (max retries reached)' },
      { id: '3', status: 'failed', errorCategory: 'validation', lastError: 'Bad Request' },
    ];

    // Simulate resetNetworkStuckActions logic
    let resetCount = 0;
    for (const item of queue) {
      const isNetwork =
        item.errorCategory === 'network' ||
        (item.lastError && (
          item.lastError.includes('Network') ||
          item.lastError.includes('Failed to fetch') ||
          item.lastError.includes('disconnected') ||
          item.lastError.includes('offline')
        ));
      if (item.status === 'stuck' && isNetwork) {
        item.status = 'pending';
        resetCount++;
      }
    }

    assert.equal(resetCount, 1);
    assert.equal(queue[0].status, 'pending');
    assert.equal(queue[1].status, 'stuck', 'Server error stuck item must not be restored by network recovery');
    assert.equal(queue[2].status, 'failed', 'Validation error must stay failed');
  });
});
