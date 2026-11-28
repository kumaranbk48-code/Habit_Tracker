/**
 * Persistent (once-ever per install) state and decision helpers for the combined
 * Android alarm permissions prompt (Full-screen notifications on Android 14+ and
 * Display over other apps).
 *
 * Uses localStorage key `habiz_alarm_permission_prompt_seen_v1` plus an in-memory
 * fallback so restricted storage never causes repeat popups.
 */

export const ALARM_PERMISSION_PROMPT_SEEN_KEY = 'habiz_alarm_permission_prompt_seen_v1';
export const ALARM_PERMISSION_PROMPT_EVENT = 'habiz-check-alarm-permissions';

let inMemoryPromptSeen = false;

function safeGetStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function hasSeenAlarmPermissionPrompt(storage = safeGetStorage()) {
  if (inMemoryPromptSeen) return true;
  if (!storage) return false;
  try {
    return storage.getItem(ALARM_PERMISSION_PROMPT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAlarmPermissionPromptSeen(storage = safeGetStorage()) {
  inMemoryPromptSeen = true;
  if (!storage) return;
  try {
    storage.setItem(ALARM_PERMISSION_PROMPT_SEEN_KEY, '1');
  } catch {
    // inMemoryPromptSeen remains true for the process lifetime even if storage throws
  }
}

/**
 * Test-only reset for unit tests. Do not invoke in application code.
 */
export function resetAlarmPermissionPromptForTests(storage = safeGetStorage()) {
  inMemoryPromptSeen = false;
  if (!storage) return;
  try {
    storage.removeItem(ALARM_PERMISSION_PROMPT_SEEN_KEY);
  } catch {}
}

/**
 * Computes which missing alarm permissions should be displayed and whether the
 * combined prompt modal should open or close.
 *
 * @param {object} params
 * @param {boolean} params.isNative
 * @param {boolean} params.fsiNeeded - true on Android 14+ (API >= 34), false on Android < 14
 * @param {boolean} params.fsiGranted
 * @param {boolean} params.overlayGranted
 * @param {boolean} [params.seenEver] - persisted per-install flag
 * @param {'auto'|'manual'} [params.trigger] - 'auto' (first-entry check only) or 'manual'
 * @param {boolean} [params.currentlyOpen]
 */
export function evaluateAlarmPermissionPrompt({
  isNative = false,
  fsiNeeded = false,
  fsiGranted = true,
  overlayGranted = true,
  seenEver = false,
  trigger = 'auto',
  currentlyOpen = false,
} = {}) {
  if (!isNative) {
    return {
      missingItems: [],
      fsiMissing: false,
      overlayMissing: false,
      allSet: false,
      shouldOpen: false,
      shouldClose: Boolean(currentlyOpen),
    };
  }

  const fsiMissing = Boolean(fsiNeeded && !fsiGranted);
  const overlayMissing = Boolean(!overlayGranted);
  const missingItems = [];

  if (fsiMissing) {
    missingItems.push({
      id: 'fsi',
      title: 'Full-screen notifications',
      description: 'Required on Android 14+ so alarms can wake your locked screen instead of arriving silently.',
      buttonLabel: 'Open settings',
    });
  }

  if (overlayMissing) {
    missingItems.push({
      id: 'overlay',
      title: 'Display over other apps',
      description: 'Allows HabiZ to pop up the alarm takeover screen while your phone is unlocked.',
      buttonLabel: 'Open settings',
    });
  }

  if (trigger === 'manual') {
    if (missingItems.length === 0) {
      if (currentlyOpen) {
        return {
          missingItems: [],
          fsiMissing: false,
          overlayMissing: false,
          allSet: true,
          shouldOpen: false,
          shouldClose: true,
        };
      }
      return {
        missingItems: [],
        fsiMissing: false,
        overlayMissing: false,
        allSet: true,
        shouldOpen: true,
        shouldClose: false,
      };
    }

    return {
      missingItems,
      fsiMissing,
      overlayMissing,
      allSet: false,
      shouldOpen: true,
      shouldClose: false,
    };
  }

  // Automatic mode: keep already-open prompt synced live while returning from settings,
  // otherwise only open if never seen before and something is missing.
  if (missingItems.length === 0) {
    return {
      missingItems: [],
      fsiMissing: false,
      overlayMissing: false,
      allSet: false,
      shouldOpen: false,
      shouldClose: Boolean(currentlyOpen),
    };
  }

  if (currentlyOpen) {
    return {
      missingItems,
      fsiMissing,
      overlayMissing,
      allSet: false,
      shouldOpen: true,
      shouldClose: false,
    };
  }

  return {
    missingItems,
    fsiMissing,
    overlayMissing,
    allSet: false,
    shouldOpen: !seenEver,
    shouldClose: false,
  };
}

/**
 * Triggers the permission modal ONLY when called explicitly as a manual open request.
 */
export function requestAlarmPermissionCheck({ manual = false } = {}) {
  if (!manual) return;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(ALARM_PERMISSION_PROMPT_EVENT, {
    detail: { manual: true },
  }));
}
