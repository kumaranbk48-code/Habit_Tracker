import { useState } from 'react';
import { Share2, Download, X } from 'lucide-react';
import { getLevelInfo, calculateXP } from '../hooks/useGamification';

function drawCard(canvas, stats, displayName) {
  const ctx    = canvas.getContext('2d');
  const W = 480, H = 280;
  canvas.width  = W;
  canvas.height = H;

  const streak  = stats?.currentStreak  || 0;
  const xp      = calculateXP(stats);
  const { current } = getLevelInfo(xp);
  const rate    = stats?.completionPercentage || 0;
  const done    = stats?.completedToday || 0;
  const total   = stats?.totalHabits   || 0;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  // Blue accent bar left
  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, '#3b82f6');
  accentGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.roundRect(0, 0, 6, H, [20, 0, 0, 20]);
  ctx.fill();

  // App name
  ctx.fillStyle = '#3b82f6';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('HABITTRACKER', 28, 36);

  // User name
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(displayName, 28, 68);

  // Level badge
  ctx.fillStyle = current.color;
  ctx.beginPath(); ctx.roundRect(28, 78, 80, 22, 6); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillText(`Lv.${current.level} ${current.title}`, 36, 93);

  // Streak section
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 52px Inter, sans-serif';
  ctx.fillText(`🔥 ${streak}`, 28, 170);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText('day streak', 28, 192);

  // Stats row
  const stats2 = [
    { label: 'Today', value: `${done}/${total}` },
    { label: 'Rate',  value: `${rate}%` },
    { label: 'XP',    value: xp.toLocaleString() },
  ];
  stats2.forEach((s, i) => {
    const x = 28 + i * 140;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillText(s.value, x, 230);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(s.label, x, 248);
  });

  // Watermark
  ctx.fillStyle = '#334155';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText('Track your habits at HabitTracker', W - 230, H - 16);
}

export default function ShareCard({ stats, displayName = 'User' }) {
  const [open,     setOpen]     = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const generate = () => {
    const canvas = document.createElement('canvas');
    drawCard(canvas, stats, displayName);
    setImageUrl(canvas.toDataURL('image/png'));
    setOpen(true);
  };

  const download = () => {
    const a = document.createElement('a');
    a.href     = imageUrl;
    a.download = `habittracker-streak.png`;
    a.click();
  };

  const share = async () => {
    if (!navigator.share) { download(); return; }
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'habit-streak.png', { type: 'image/png' });
      await navigator.share({ title: 'My HabitTracker Streak', files: [file] });
    } catch {
      download();
    }
  };

  return (
    <>
      <button
        onClick={generate}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all active:scale-95"
      >
        <Share2 size={15} className="text-white" /> Share Streak
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Your Streak Card</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              {imageUrl && (
                <img src={imageUrl} alt="Streak card" className="w-full rounded-xl shadow-md" />
              )}
              <p className="text-xs text-gray-400 text-center mt-3 mb-4">
                Screenshot or download to share your progress!
              </p>
              <div className="flex gap-3">
                <button onClick={share}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <Share2 size={15} /> Share
                </button>
                <button onClick={download}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <Download size={15} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
