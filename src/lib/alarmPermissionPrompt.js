/**
 * Pure decision helper and session-only tracker for the combined Android alarm
 * permissions prompt (Full-screen notifications on Android 14+ & Display over other apps).
 *
 * Intentionally avoids localStorage suppression so missing permissions can be checked
 * cleanly once per app session across restarts while still respecting "Later" for
 * the current session.
 */

const sessionPromptState = {
  shown: false,
  dismissed: false,
};

export const ALARM_PERMISSION_PROMPT_EVENT = 'habiz-check-alarm-permissions';

export function getAlarmPermissionPromptSession() {
  return { ...sessionPromptState };
}

export function resetAlarmPermissionPromptSession() {
  sessionPromptState.shown = false;
  sessionPromptState.dismissed = false;
}

export function markAlarmPermissionPromptShown() {
  sessionPromptState.shown = true;
}

export function dismissAlarmPermissionPromptForSession() {
  sessionPromptState.shown = true;
  sessionPromptState.dismissed = true;
}

/**
 * Computes which missing alarm permissions should be displayed in the combined modal,
 * whether the modal should auto-open, and whether an already-open modal should close.
 *
 * @param {object} params
 * @param {boolean} params.isNative
 * @param {boolean} params.fsiNeeded - true on Android 14+ (API >= 34), false on Android < 14
 * @param {boolean} params.fsiGranted
 * @param {boolean} params.overlayGranted
 * @param {boolean} [params.shownThisSession]
 * @param {boolean} [params.dismissedThisSession]
 * @param {boolean} [params.currentlyOpen]
 */
export function evaluateAlarmPermissionPrompt({
  isNative = false,
  fsiNeeded = false,
  fsiGranted = true,
  overlayGranted = true,
  shownThisSession = false,
  dismissedThisSession = false,
  currentlyOpen = false,
} = {}) {
  if (!isNative) {
    return {
      missingItems: [],
      fsiMissing: false,
      overlayMissing: false,
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

  if (missingItems.length === 0) {
    return {
      missingItems: [],
      fsiMissing: false,
      overlayMissing: false,
      shouldOpen: false,
      shouldClose: Boolean(currentlyOpen),
    };
  }

  // Keep modal open during a live resume refresh after visiting Android Settings.
  if (currentlyOpen) {
    return {
      missingItems,
      fsiMissing,
      overlayMissing,
      shouldOpen: true,
      shouldClose: false,
    };
  }

  const canAutoOpen = !shownThisSession && !dismissedThisSession;
  return {
    missingItems,
    fsiMissing,
    overlayMissing,
    shouldOpen: canAutoOpen,
    shouldClose: false,
  };
}

/**
 * Triggers a shared check across mounted Layout/Reminders listeners without
 * needing direct prop wiring.
 */
export function requestAlarmPermissionCheck({ beforeScheduling = false } = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(ALARM_PERMISSION_PROMPT_EVENT, {
    detail: { beforeScheduling },
  }));
}
