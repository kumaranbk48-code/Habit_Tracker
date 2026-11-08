// Database wake/restore utility
// Previously this sent project data to designarena.ai — that has been removed.
// If you need auto-restore for paused Supabase projects, configure it through
// Supabase's own dashboard or use their official API.

let _restoreTriggered = false;

export function triggerRestore() {
  if (_restoreTriggered) return;
  _restoreTriggered = true;
  console.warn('[db-wake] Database may be paused. Check your Supabase dashboard.');
  setTimeout(() => { _restoreTriggered = false; }, 60000);
}
