import { useState, useEffect, useCallback, useRef } from 'react';
import { BellRing, Layers, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import {
  isNative,
  getAlarmPermissionStatus,
  requestFullScreenIntentPermission,
  openOverlaySettings,
} from '../lib/nativeNotifications';
import {
  ALARM_PERMISSION_PROMPT_EVENT,
  dismissAlarmPermissionPromptForSession,
  evaluateAlarmPermissionPrompt,
  getAlarmPermissionPromptSession,
  markAlarmPermissionPromptShown,
} from '../lib/alarmPermissionPrompt';

export default function AlarmPermissionPromptModal() {
  const [open, setOpen] = useState(false);
  const [missingItems, setMissingItems] = useState([]);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const runCheck = useCallback(async ({ isResumeRefresh = false } = {}) => {
    if (!isNative) return;
    try {
      const status = await getAlarmPermissionStatus();
      const session = getAlarmPermissionPromptSession();
      const decision = evaluateAlarmPermissionPrompt({
        isNative: status.isNative,
        fsiNeeded: status.fsiNeeded,
        fsiGranted: status.fsiGranted,
        overlayGranted: status.overlayGranted,
        shownThisSession: session.shown,
        dismissedThisSession: session.dismissed,
        currentlyOpen: isResumeRefresh && openRef.current,
      });

      if (decision.shouldClose) {
        openRef.current = false;
        setOpen(false);
        setMissingItems([]);
        return;
      }

      if (decision.shouldOpen && decision.missingItems.length > 0) {
        if (!openRef.current) {
          markAlarmPermissionPromptShown();
        }
        openRef.current = true;
        setMissingItems(decision.missingItems);
        setOpen(true);
      } else if (openRef.current && decision.missingItems.length > 0) {
        setMissingItems(decision.missingItems);
      }
    } catch (err) {
      console.warn('[AlarmPermissionPromptModal] Permission check failed:', err);
    }
  }, []);

  // App start check + shared trigger listener (Reminders mount & before scheduling alarms)
  useEffect(() => {
    if (!isNative) return undefined;

    runCheck({ isResumeRefresh: false });

    const handleTrigger = () => {
      runCheck({ isResumeRefresh: openRef.current });
    };

    const handleForegroundRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      runCheck({ isResumeRefresh: true });
    };

    window.addEventListener(ALARM_PERMISSION_PROMPT_EVENT, handleTrigger);
    window.addEventListener('focus', handleForegroundRefresh);
    document.addEventListener('visibilitychange', handleForegroundRefresh);
    document.addEventListener('resume', handleForegroundRefresh);

    return () => {
      window.removeEventListener(ALARM_PERMISSION_PROMPT_EVENT, handleTrigger);
      window.removeEventListener('focus', handleForegroundRefresh);
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
      document.removeEventListener('resume', handleForegroundRefresh);
    };
  }, [runCheck]);

  const handleLater = () => {
    dismissAlarmPermissionPromptForSession();
    openRef.current = false;
    setOpen(false);
  };

  const handleOpenItemSettings = async (itemId) => {
    if (itemId === 'fsi') {
      await requestFullScreenIntentPermission();
    } else if (itemId === 'overlay') {
      await openOverlaySettings();
    }
    // Live refresh in case user returned immediately or OS granted without restart
    await runCheck({ isResumeRefresh: true });
  };

  if (!open || missingItems.length === 0) return null;

  return (
    <Modal
      isOpen={open}
      onClose={handleLater}
      title="Full-Screen Alarm Permissions"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          Allow {missingItems.length === 2 ? 'these permissions' : 'this permission'} so HabiZ alarms always appear full-screen when your phone is locked or in another app.
        </p>

        <div className="space-y-3">
          {missingItems.map((item) => {
            const Icon = item.id === 'fsi' ? BellRing : Layers;
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#141d26] border border-white/[0.08] flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#178274]/20 border border-[#178274]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={15} className="text-[#5fae9e]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{item.title}</div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenItemSettings(item.id)}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-[#178274] hover:bg-[#136c60] rounded-xl transition-all shadow-md shadow-teal-950/40 active:scale-95 cursor-pointer flex-shrink-0 inline-flex items-center gap-1.5"
                >
                  <span>{item.buttonLabel}</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={handleLater}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </Modal>
  );
}
