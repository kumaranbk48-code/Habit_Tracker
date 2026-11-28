import { useState, useEffect, useCallback, useRef } from 'react';
import { BellRing, Layers, ExternalLink, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import {
  isNative,
  getAlarmPermissionStatus,
  requestFullScreenIntentPermission,
  openOverlaySettings,
} from '../lib/nativeNotifications';
import {
  ALARM_PERMISSION_PROMPT_EVENT,
  evaluateAlarmPermissionPrompt,
  hasSeenAlarmPermissionPrompt,
  markAlarmPermissionPromptSeen,
} from '../lib/alarmPermissionPrompt';

export default function AlarmPermissionPromptModal() {
  const [open, setOpen] = useState(false);
  const [missingItems, setMissingItems] = useState([]);
  const [allSet, setAllSet] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const runCheck = useCallback(async ({ trigger = 'auto', isResumeRefresh = false } = {}) => {
    if (!isNative) return;
    if (isResumeRefresh && !openRef.current) return;

    try {
      const status = await getAlarmPermissionStatus();
      const seenEver = hasSeenAlarmPermissionPrompt();
      const decision = evaluateAlarmPermissionPrompt({
        isNative: status.isNative,
        fsiNeeded: status.fsiNeeded,
        fsiGranted: status.fsiGranted,
        overlayGranted: status.overlayGranted,
        seenEver,
        trigger,
        currentlyOpen: isResumeRefresh && openRef.current,
      });

      if (decision.shouldClose) {
        openRef.current = false;
        setOpen(false);
        setMissingItems([]);
        setAllSet(false);
        return;
      }

      if (decision.shouldOpen) {
        if (!seenEver && trigger === 'auto') {
          markAlarmPermissionPromptSeen();
        }
        openRef.current = true;
        setMissingItems(decision.missingItems);
        setAllSet(Boolean(decision.allSet));
        setOpen(true);
      } else if (openRef.current) {
        setMissingItems(decision.missingItems);
        setAllSet(Boolean(decision.allSet));
      }
    } catch (err) {
      console.warn('[AlarmPermissionPromptModal] Permission check failed:', err);
    }
  }, []);

  // Automatic first-entry check runs ONCE on mount (plus explicit manual opens)
  useEffect(() => {
    if (!isNative) return undefined;

    runCheck({ trigger: 'auto', isResumeRefresh: false });

    const handleTrigger = (e) => {
      if (e?.detail?.manual === true) {
        runCheck({ trigger: 'manual', isResumeRefresh: false });
      }
    };

    window.addEventListener(ALARM_PERMISSION_PROMPT_EVENT, handleTrigger);
    return () => {
      window.removeEventListener(ALARM_PERMISSION_PROMPT_EVENT, handleTrigger);
    };
  }, [runCheck]);

  // Refresh live status while the modal IS ALREADY OPEN (never opens a closed modal)
  useEffect(() => {
    if (!open || !isNative) return undefined;

    const handleResumeRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      runCheck({ trigger: 'auto', isResumeRefresh: true });
    };

    window.addEventListener('focus', handleResumeRefresh);
    document.addEventListener('visibilitychange', handleResumeRefresh);
    document.addEventListener('resume', handleResumeRefresh);

    return () => {
      window.removeEventListener('focus', handleResumeRefresh);
      document.removeEventListener('visibilitychange', handleResumeRefresh);
      document.removeEventListener('resume', handleResumeRefresh);
    };
  }, [open, runCheck]);

  const handleClose = () => {
    openRef.current = false;
    setOpen(false);
  };

  const handleOpenItemSettings = async (itemId) => {
    if (itemId === 'fsi') {
      await requestFullScreenIntentPermission();
    } else if (itemId === 'overlay') {
      await openOverlaySettings();
    }
    await runCheck({ trigger: 'auto', isResumeRefresh: true });
  };

  if (!open || (!allSet && missingItems.length === 0)) return null;

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Full-Screen Alarm Permissions"
    >
      <div className="space-y-4">
        {allSet ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-100 font-medium">
              All set! Full-screen alarm permissions are enabled.
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            {allSet ? 'Done' : 'Later'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
