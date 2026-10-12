import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  User, Mail, Download, Edit3, LogOut, Sparkles,
  Camera, Trash2, HelpCircle, ChevronRight, Heart
} from 'lucide-react';
import BadgeGrid from '../components/BadgeGrid';
import Modal from '../components/Modal';
import { motion } from 'framer-motion';
import { calculateXP, checkNewBadges } from '../hooks/useGamification';

export default function Profile() {
  const { user } = useAuth();
  const [dashStats, setDashStats] = useState(null);
  const [unlockedIds, setUnlockedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [editNameModal, setEditNameModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);

  const initialName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initialAvatar = user?.user_metadata?.avatar_url || '';
  const [fullName, setFullName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [exporting, setExporting] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user?.user_metadata) {
      setFullName(user.user_metadata.full_name || user?.email?.split('@')[0] || 'User');
      setAvatarUrl(user.user_metadata.avatar_url || '');
    }
  }, [user]);

  const fetchProfileData = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    try {
      const [dashRes, achRes] = await Promise.all([
        fetch('/api/dashboard', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/achievements', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => null),
      ]);

      let statsData = null;
      if (dashRes.ok) {
        statsData = await dashRes.json();
        setDashStats(statsData);
      }

      let earned = [];
      if (achRes && achRes.ok) {
        earned = (await achRes.json()).map(a => a.badge_id);
      }

      if (statsData) {
        const newBadges = checkNewBadges(statsData, earned);
        const allUnlocked = [...new Set([...earned, ...newBadges])];
        setUnlockedIds(allUnlocked);
      } else {
        setUnlockedIds(earned);
      }
    } catch (e) {
      console.error('Failed to fetch profile stats', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useEffect(() => {
    const handleUpdate = () => fetchProfileData();
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    return () => window.removeEventListener('habittracker-stats-updated', handleUpdate);
  }, [fetchProfileData]);

  // Handle Direct Image File Upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle Update Profile Full Name & Photo in Supabase Auth Metadata
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          avatar_url: avatarUrl || null,
        },
      });

      if (error) throw error;
      setEditNameModal(false);
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setSavingName(false);
    }
  };

  // Handle Complete Data Export
  const handleExportData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setExporting(true);
    try {
      const res = await fetch('/api/account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Export request failed');
      const exportJson = await res.json();
      const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HabiZ_Full_Archive_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export data: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Handle Permanent Account Deletion
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deleteConfirmText.trim() !== 'DELETE') {
      alert('Please type DELETE to confirm account deletion.');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Deletion failed');
      }
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (e) {
      alert('Failed to delete account: ' + e.message);
      setDeleting(false);
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const avatar = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const xp = calculateXP(dashStats);
  const streak = dashStats?.currentStreak || 0;
  const longestStreak = dashStats?.longestStreak || 0;
  const totalCompletions = dashStats?.totalCompletions || 0;
  const joinedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recent';

  // Level & XP values
  const currentLevel = Math.max(1, Math.floor(xp / 100) + 1);
  const currentLevelXP = xp % 100;
  const levelTitle = currentLevel === 1 ? 'Beginner' : currentLevel === 2 ? 'Apprentice' : currentLevel === 3 ? 'Adept' : 'Master';

  return (
    <div className="space-y-6 page-enter pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Profile
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage your account and view milestones.
          </p>
        </div>
      </div>

      {/* ── User Header Card (Theme-matched Emerald / Teal Atmospheric Glassmorphic Card) ── */}
      <div className="relative rounded-3xl overflow-hidden border border-teal-500/25 bg-gradient-to-br from-[#0a1922] via-[#0d212b] to-[#07131a] p-6 sm:p-8 shadow-2xl">
        {/* Subtle landscape artwork blend on right, matching Goals & Learning banners */}
        <div
          className="absolute right-0 top-0 bottom-0 w-full sm:w-1/2 opacity-20 pointer-events-none bg-cover bg-right mix-blend-screen"
          style={{
            backgroundImage: 'url(/assets/hero-landscape.jpg)',
            maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, black 100%)',
          }}
        />

        {/* Atmospheric Glowing Radial Gradients Matching HabiZ Brand */}
        <div
          className="absolute -right-12 -top-12 w-80 h-80 pointer-events-none rounded-full blur-3xl opacity-35"
          style={{ background: 'radial-gradient(circle, #178274 0%, #2dd4bf 40%, transparent 70%)' }}
        />
        <div
          className="absolute -left-12 -bottom-12 w-64 h-64 pointer-events-none rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0f766e 0%, transparent 70%)' }}
        />

        {/* Subtle geometric dot grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(#2dd4bf 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          {/* Avatar + Name + Badges */}
          <div className="flex items-center gap-5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr from-[#178274] via-[#2dd4bf] to-emerald-400 shadow-[0_0_24px_rgba(45,212,191,0.3)]">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#0c1820] flex items-center justify-center text-3xl sm:text-4xl font-black text-white">
                  {avatar ? (
                    <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-950/80 text-teal-300 border border-teal-500/35 shadow-xs">
                  ✦ HabiZ Member
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Joined {joinedDate}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
                {displayName}
              </h2>

              <p className="text-xs sm:text-sm text-slate-300/80 mt-1 flex items-center gap-2 truncate">
                <Mail size={13} className="text-teal-400 flex-shrink-0" />
                <span className="truncate">{user?.email}</span>
              </p>
            </div>
          </div>

          {/* Action button: Edit Profile */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setEditNameModal(true)}
            className="self-start sm:self-center px-4 py-2 rounded-xl text-xs font-bold text-teal-200 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/35 transition-all shadow-md shadow-teal-950/40 cursor-pointer flex items-center gap-1.5"
          >
            <Edit3 size={13} />
            <span>Edit Profile</span>
          </motion.button>
        </div>

        {/* Quick Highlights Strip inside Profile Card */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/[0.08]">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Current Streak</div>
            <div className="text-lg sm:text-xl font-black text-amber-400 mt-0.5 flex items-center gap-1">
              <span>{streak}</span>
              <span className="text-xs font-normal text-slate-400">days 🔥</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Best Streak</div>
            <div className="text-lg sm:text-xl font-black text-teal-300 mt-0.5 flex items-center gap-1">
              <span>{longestStreak}</span>
              <span className="text-xs font-normal text-slate-400">days 🏆</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Completions</div>
            <div className="text-lg sm:text-xl font-black text-white mt-0.5 flex items-center gap-1">
              <span>{totalCompletions}</span>
              <span className="text-xs font-normal text-slate-400">rituals ✅</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Badges Unlocked</div>
            <div className="text-lg sm:text-xl font-black text-white mt-0.5 flex items-center gap-1">
              <span>{unlockedIds.length}</span>
              <span className="text-xs font-normal text-slate-400">achievements 🎖️</span>
            </div>
          </div>
        </div>

        {/* Level XP Bar */}
        <div className="relative z-10 mt-5 pt-5 border-t border-white/[0.06]">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="text-white font-bold flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-[10px] font-black uppercase">Level {currentLevel}</span>
              <span>{levelTitle}</span>
            </span>
            <span className="text-slate-400">
              <span className="text-teal-300 font-mono font-bold">{currentLevelXP}</span>
              <span className="text-slate-500"> / 100 XP</span>
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-900/80 border border-white/[0.06] overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#178274] via-[#2dd4bf] to-emerald-400 transition-all duration-700 shadow-[0_0_12px_rgba(45,212,191,0.4)]"
              style={{ width: `${Math.min(100, Math.max(5, currentLevelXP))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Two Column Balanced Layout (Perfect 50/50 Equal-Height Alignment) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Left Card: Account & Actions */}
        <div className="habiz-panel rounded-3xl p-6 sm:p-7 flex flex-col justify-between h-full border border-white/[0.08] shadow-xl">
          <div>
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/[0.06]">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/25 text-teal-300 flex items-center justify-center flex-shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Account &amp; Actions</h3>
                <p className="text-xs text-slate-400">Manage credentials, guides &amp; session</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Menu Item 1: Edit Profile */}
              <motion.button
                whileHover={{ x: 3 }}
                transition={{ duration: 0.15 }}
                onClick={() => setEditNameModal(true)}
                className="w-full p-3.5 rounded-2xl bg-white/[0.02] hover:bg-teal-500/[0.08] border border-white/[0.05] hover:border-teal-500/30 flex items-center justify-between group transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <User size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">Edit Profile</span>
                    <span className="text-xs text-slate-400">Change your display name or photo</span>
                  </div>
                </div>
                <ChevronRight size={17} className="text-slate-500 group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all" />
              </motion.button>

              {/* Menu Item 2: Help & Support */}
              <motion.button
                whileHover={{ x: 3 }}
                transition={{ duration: 0.15 }}
                onClick={() => setHelpModal(true)}
                className="w-full p-3.5 rounded-2xl bg-white/[0.02] hover:bg-teal-500/[0.08] border border-white/[0.05] hover:border-teal-500/30 flex items-center justify-between group transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">Help &amp; Support</span>
                    <span className="text-xs text-slate-400">FAQ, user guides, habit tips &amp; export</span>
                  </div>
                </div>
                <ChevronRight size={17} className="text-slate-500 group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all" />
              </motion.button>

              {/* Menu Item 3: Log Out */}
              <motion.button
                whileHover={{ x: 3 }}
                transition={{ duration: 0.15 }}
                onClick={() => supabase.auth.signOut()}
                className="w-full p-3.5 rounded-2xl bg-white/[0.02] hover:bg-red-500/[0.08] border border-white/[0.05] hover:border-red-500/30 flex items-center justify-between group transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <LogOut size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-red-400 block">Log Out</span>
                    <span className="text-xs text-slate-400">Safely sign out of your HabiZ account</span>
                  </div>
                </div>
                <ChevronRight size={17} className="text-slate-500 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all" />
              </motion.button>
            </div>
          </div>

          {/* Danger zone subtle trigger */}
          <div className="pt-4 mt-4 border-t border-white/[0.05] flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px]">Erase account &amp; data:</span>
            <button
              onClick={() => { setDeleteConfirmText(''); setDeleteModal(true); }}
              className="text-[11px] font-medium text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              Permanently Delete
            </button>
          </div>
        </div>

        {/* Right Card: Daily Mindfulness Inspiration */}
        <div className="habiz-panel rounded-3xl overflow-hidden relative flex flex-col justify-between h-full min-h-[300px] p-6 sm:p-7 border border-white/[0.08] shadow-xl group">
          {/* Scenic Nature Image Background */}
          <img
            src="/assets/nature-card.jpg"
            alt="Nature Inspiration"
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.55] contrast-[1.1] scale-105 group-hover:scale-100 transition-transform duration-700 pointer-events-none"
          />
          {/* Gradient Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080d12] via-[#080d12]/60 to-transparent pointer-events-none" />

          {/* Content Overlay Top */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[11px] font-bold text-teal-300">
              ✦ Daily Mindfulness
            </span>
            <span className="text-[11px] font-medium text-slate-300/80 bg-black/40 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/5">
              🌱 Habit Mindset
            </span>
          </div>

          {/* Content Overlay Bottom */}
          <div className="relative z-10 space-y-3 pt-6">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 backdrop-blur-md border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-sm">
              <Heart size={19} />
            </div>
            <blockquote className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
              &quot;A little progress each day adds up to big results.&quot;
            </blockquote>
            <p className="text-xs text-slate-300/80 font-normal">
              Small rituals practiced with patience reshape your daily rhythm and purpose.
            </p>
            <div className="flex items-center gap-2.5 pt-1 text-xs text-slate-200 font-medium flex-wrap">
              <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
                🔥 {streak} Days Active
              </span>
              <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
                ✅ {totalCompletions} Completed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Full Achievements & Badges Showcase ── */}
      <BadgeGrid
        unlockedIds={unlockedIds}
        newlyUnlocked={[]}
        categoryStreaks={{
          dailyStreak: dashStats?.currentStreak || 0,
          weeklyStreak: Math.floor((dashStats?.currentStreak || 0) / 7),
          monthlyStreak: Math.floor((dashStats?.currentStreak || 0) / 30),
        }}
      />

      {/* ── Edit Profile Modal ── */}
      <Modal open={editNameModal} onClose={() => setEditNameModal(false)} title="Edit Profile">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm outline-none focus:ring-1 focus:ring-teal-400 text-white placeholder-slate-500"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Profile Photo</label>
            <div className="flex items-center gap-3.5 p-3.5 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center text-slate-400 flex-shrink-0 relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <Camera size={24} className="text-slate-400" />
                )}
              </div>

              <div className="flex-1 space-y-1">
                <input
                  type="file"
                  id="avatar-device-input"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="avatar-device-input"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-teal-300 border border-white/[0.08] cursor-pointer transition-colors"
                  >
                    <Camera size={13} />
                    <span>Upload Image</span>
                  </label>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Select any square image from your computer (max 5MB).</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditNameModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingName}
              className="px-4 py-2 bg-[#178274] hover:bg-[#136c60] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              {savingName ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Help & Support Modal ── */}
      <Modal open={helpModal} onClose={() => setHelpModal(false)} title="HabiZ Help & Quick Guide">
        <div className="space-y-4 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
            <h4 className="font-bold text-teal-300 text-sm mb-1">Building Lasting Consistency</h4>
            <p className="text-slate-300">
              HabiZ is built on micro-shifts. Don&apos;t aim to overhaul your whole day at once — focus on completing 2-3 core habits daily to safeguard your streak.
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-white text-xs">Features Overview</h5>
            <ul className="space-y-1.5 list-disc list-inside text-slate-400">
              <li><strong className="text-slate-200">Dashboard:</strong> Your command center with streak fire, quick check-offs, and XP level.</li>
              <li><strong className="text-slate-200">Learning Space:</strong> Structured roadmaps to master tech and habit skills.</li>
              <li><strong className="text-slate-200">Goals & Tasks:</strong> Link long-term dreams to concrete daily milestones.</li>
              <li><strong className="text-slate-200">Reminders:</strong> Desktop alarms and push alerts to never miss what matters.</li>
              <li><strong className="text-slate-200">Reports:</strong> Visual analytics, weekly/monthly navigation, and PDF summaries.</li>
            </ul>
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <div>
              <span className="text-xs text-white font-semibold block">Data Archive</span>
              <span className="text-[11px] text-slate-400">Export your habits &amp; tracking JSON</span>
            </div>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-teal-300 border border-teal-500/20 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>{exporting ? 'Exporting...' : 'Export JSON'}</span>
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setHelpModal(false)}
              className="px-4 py-2 bg-[#178274] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Account Confirmation Modal ── */}
      <Modal open={deleteModal} onClose={() => !deleting && setDeleteModal(false)} title="Delete Account & All Data">
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-2xl text-xs text-red-300 space-y-2">
            <p className="font-bold text-sm">Warning: This action is permanent and irreversible!</p>
            <p>All your habits, streak history, goals, milestones, reminders, and learning journeys will be permanently erased.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm:
            </label>
            <input
              required
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-sm outline-none focus:ring-1 focus:ring-red-400 text-white font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting || deleteConfirmText.trim() !== 'DELETE'}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              {deleting ? 'Erasing Account...' : 'Permanently Delete My Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
