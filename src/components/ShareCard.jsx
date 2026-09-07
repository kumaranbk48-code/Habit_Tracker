import { useState, useEffect, useCallback } from 'react';
import { Share2, Download, Copy, Check, Flame, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { getLevelInfo, calculateXP } from '../hooks/useGamification';

function drawCard(canvas, stats, displayName) {
  const ctx = canvas.getContext('2d');
  const dpr = 2;
  const W = 520, H = 300;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const streak = stats?.currentStreak || 0;
  const xp = calculateXP(stats);
  const { current } = getLevelInfo(xp);
  const rate = stats?.completionPercentage || 0;
  const done = stats?.completedToday || 0;
  const total = stats?.totalHabits || 0;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#1e293b');
  bgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, W, H, 24);
  } else {
    ctx.rect(0, 0, W, H);
  }
  ctx.fill();

  // Vibrant accent gradient bar
  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, '#3d7a75');
  accentGrad.addColorStop(1, '#5fae9e');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, 8, H, [24, 0, 0, 24]);
  } else {
    ctx.rect(0, 0, 8, H);
  }
  ctx.fill();

  // App Logo Header
  ctx.fillStyle = '#5fae9e';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('HABITTRACKER 2.0', 32, 40);

  // User Display Name
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.fillText(displayName, 32, 74);

  // Level Badge
  ctx.fillStyle = current.color || '#3d7a75';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(32, 86, 110, 24, 8);
  } else {
    ctx.rect(32, 86, 110, 24);
  }
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillText(`Lv.${current.level} ${current.title}`, 42, 102);

  // Big Streak Counter
  ctx.fillStyle = '#dcb579';
  ctx.font = 'bold 56px Inter, sans-serif';
  ctx.fillText(`🔥 ${streak}`, 32, 180);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('DAYS CONSISTENT', 32, 204);

  // Metrics Grid
  const metrics = [
    { label: 'Completed Today', value: `${done}/${total}` },
    { label: 'Completion Rate', value: `${rate}%` },
    { label: 'Total Earned XP', value: xp.toLocaleString() },
  ];
  metrics.forEach((m, i) => {
    const x = 32 + i * 150;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText(m.value, x, 248);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(m.label, x, 266);
  });

  // Footer Watermark
  ctx.fillStyle = '#475569';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText('habittracker.app', W - 120, H - 20);
}

export default function ShareCard({
  open: externalOpen,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  stats,
  displayName = 'User',
  showButton = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const isControlled = externalOpen !== undefined || externalIsOpen !== undefined;
  const isModalOpen = isControlled ? Boolean(externalOpen ?? externalIsOpen) : internalOpen;

  const streak = stats?.currentStreak || 0;
  const shareText = `🔥 I'm on a ${streak}-day streak on HabitTracker!\nBuilding better habits every single day. 💪\nJoin me at HabitTracker!`;

  const handleClose = () => {
    if (externalOnClose) externalOnClose();
    if (!isControlled) setInternalOpen(false);
  };

  const generate = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      drawCard(canvas, stats, displayName);
      setImageUrl(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Failed to generate streak card preview:', err);
    }
  }, [stats, displayName]);

  useEffect(() => {
    if (isModalOpen) {
      generate();
    }
  }, [isModalOpen, generate]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `habittracker-streak-${streak}-days.png`;
    a.click();
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const el = document.createElement('textarea');
      el.value = shareText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        if (imageUrl) {
          const blob = await (await fetch(imageUrl)).blob();
          const file = new File([blob], 'habit-streak.png', { type: 'image/png' });
          await navigator.share({
            title: 'My HabitTracker Streak',
            text: shareText,
            files: [file],
          });
          return;
        }
        await navigator.share({
          title: 'My HabitTracker Streak',
          text: shareText,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleCopyText();
        }
      }
    } else {
      handleCopyText();
    }
  };

  return (
    <>
      {showButton && (
        <button
          onClick={() => {
            generate();
            setInternalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-xl text-xs font-semibold shadow-md shadow-[#3d7a75]/20 transition-all active:scale-95 flex-shrink-0 cursor-pointer"
        >
          <Share2 size={15} /> Share Streak
        </button>
      )}

      <Modal open={isModalOpen} onClose={handleClose} title="Share Your Progress" maxWidth="max-w-md">
        <div className="space-y-5 py-1">
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              You're on a <span className="text-[#3d7a75] dark:text-[#5fae9e] font-extrabold">{streak} Day Streak!</span> 🔥
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Keep the consistency going every single day.
            </p>
          </div>

          {/* Visual Card Preview */}
          {imageUrl ? (
            <div className="relative rounded-2xl overflow-hidden shadow-md border border-[#e2e8ec] dark:border-[#2a343d] group bg-[#0f172a]">
              <img
                src={imageUrl}
                alt="Habit streak progress card"
                className="w-full h-auto max-h-[260px] object-contain rounded-2xl mx-auto block"
              />
            </div>
          ) : (
            <div className="bg-[#14181c] text-white rounded-2xl p-6 text-center space-y-3 border border-[#2a343d]">
              <Flame size={48} className="text-[#dcb579] mx-auto animate-bounce" />
              <p className="text-3xl font-extrabold text-white">{streak} DAYS</p>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">CONSISTENT</p>
              <p className="text-xs text-[#5fae9e] font-semibold">HabitTracker</p>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={handleDownload}
              className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#f1f3f5] hover:bg-[#e2e8ec] dark:bg-[#14181c] dark:hover:bg-[#2a343d] text-gray-700 dark:text-gray-200 border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            >
              <Download size={16} className="text-[#3d7a75] dark:text-[#5fae9e]" />
              <span>Download</span>
            </button>

            <button
              onClick={handleCopyText}
              className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#f1f3f5] hover:bg-[#e2e8ec] dark:bg-[#14181c] dark:hover:bg-[#2a343d] text-gray-700 dark:text-gray-200 border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl text-xs font-semibold transition-all active:scale-95 relative cursor-pointer"
            >
              {copied ? <Check size={16} className="text-[#2f6b5c] dark:text-[#7fd1b9]" /> : <Copy size={16} className="text-[#3d7a75] dark:text-[#5fae9e]" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-2xl text-xs font-semibold transition-all shadow-md shadow-[#3d7a75]/20 active:scale-95 cursor-pointer"
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
