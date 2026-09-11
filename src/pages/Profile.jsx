import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  User, Mail, Calendar, ShieldCheck, Flame, Trophy, Award,
  Download, Moon, Sun, Check, Edit3, Settings, Save, LogOut, CheckCircle2,
  Sparkles, Sliders, Upload, Camera, Trash2
} from 'lucide-react';
import XPLevelBar from '../components/XPLevelBar';
import ThemeToggle from '../components/ThemeToggle';
import Modal from '../components/Modal';
import CustomSelect from '../components/CustomSelect';
import { calculateXP } from '../hooks/useGamification';

export default function Profile() {
  const { user } = useAuth();
  const [dashStats, setDashStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [editNameModal, setEditNameModal] = useState(false);
  
  const initialName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initialAvatar = user?.user_metadata?.avatar_url || '';
  const [fullName, setFullName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [nameSuccess, setNameSuccess] = useState(false);
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

  // Preferences State
  const [weekStart, setWeekStart] = useState('Monday');
  const [dailyTarget, setDailyTarget] = useState(5);
  const [prefSaved, setPrefSaved] = useState(false);

  const fetchProfileData = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashStats(data);
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
          avatar_url: avatarUrl.trim()
        }
      });
      if (error) throw error;
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
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
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HabitTracker_Full_Archive_${new Date().toISOString().split('T')[0]}.json`;
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

  const handleSavePreferences = (e) => {
    e.preventDefault();
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 2500);
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const avatar = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const xp = calculateXP(dashStats);
  const streak = dashStats?.currentStreak || 0;
  const longestStreak = dashStats?.longestStreak || 0;
  const totalCompletions = dashStats?.totalCompletions || 0;
  const totalHabits = dashStats?.totalHabits || 0;
  const joinedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recent';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-8">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">User Profile & Account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your personal details, achievements, and app preferences</p>
        </div>
        <button
          onClick={handleExportData}
          className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
        >
          <Download size={14} className="text-[#3d7a75] dark:text-[#5fae9e]" /> Export Data JSON
        </button>
      </div>

      {/* Main Profile Header Banner Card */}
      <div
        className="rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden"
        style={{ background: 'linear-gradient(120deg, #14181c 0%, #1c2734 45%, #1f3a3a 100%)' }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 z-10 relative">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/10 border-2 border-white/30 flex items-center justify-center text-3xl font-extrabold text-white shadow-lg flex-shrink-0">
              {avatar ? (
                <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <button
              onClick={() => setEditNameModal(true)}
              className="absolute -bottom-2 -right-2 p-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-xl shadow-md border border-white/40 transition-transform active:scale-95"
              title="Edit Profile Name"
            >
              <Edit3 size={14} />
            </button>
          </div>

          {/* User Meta Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-white leading-tight">{displayName}</h2>
            </div>

            <p className="text-sm text-[#cbd5e1] flex items-center justify-center sm:justify-start gap-1.5 mb-4">
              <Mail size={14} className="text-[#8fd0c4]" /> {user?.email}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-[#cbd5e1]">
              <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 flex items-center gap-1.5">
                <Calendar size={13} /> Member since {joinedDate}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 flex items-center gap-1.5">
                <Flame size={13} className="text-orange-400" /> {streak}-Day Active Streak
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress & Gamification Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/80 space-y-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" /> Personal Achievement & XP Overview
        </h3>

        <XPLevelBar xp={xp} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 text-center">
            <span className="text-xs text-slate-400 dark:text-slate-400 block font-medium">Current Streak</span>
            <span className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 block">🔥 {streak} days</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 text-center">
            <span className="text-xs text-slate-400 dark:text-slate-400 block font-medium">Longest Streak</span>
            <span className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 block">🏆 {longestStreak} days</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 text-center">
            <span className="text-xs text-slate-400 dark:text-slate-400 block font-medium">Lifetime Done</span>
            <span className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 block">✅ {totalCompletions}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 text-center">
            <span className="text-xs text-slate-400 dark:text-slate-400 block font-medium">Active Habits</span>
            <span className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 block">⚡ {totalHabits}</span>
          </div>
        </div>
      </div>

      {/* Grid: App Preferences + Theme & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Habit & Schedule Preferences */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/80">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Sliders size={18} className="text-[#3d7a75] dark:text-[#5fae9e]" /> Habit Preferences
          </h3>

          <form onSubmit={handleSavePreferences} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Week Start Day</label>
              <CustomSelect
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#3d7a75]"
              >
                <option value="Monday">Monday (Standard)</option>
                <option value="Sunday">Sunday</option>
              </CustomSelect>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Daily Target Completion Goal</label>
              <CustomSelect
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#3d7a75]"
              >
                <option value={3}>3 Habits / day</option>
                <option value={5}>5 Habits / day (Recommended)</option>
                <option value={8}>8 Habits / day</option>
              </CustomSelect>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              {prefSaved ? <CheckCircle2 size={15} /> : <Save size={15} />}
              <span>{prefSaved ? 'Preferences Saved!' : 'Save Preferences'}</span>
            </button>
          </form>
        </div>

        {/* Theme & Display Options */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/80 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Settings size={18} className="text-[#7570ab] dark:text-[#b0aee0]" /> Interface & Dark Mode
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Appearance Mode</h4>
                  <p className="text-[11px] text-slate-400 dark:text-slate-400">Toggle between Light & Deep Obsidian Dark theme</p>
                </div>
                <ThemeToggle />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Export Full Archive</h4>
                  <p className="text-[11px] text-slate-400 dark:text-slate-400">Download complete habit history, goals & learning data (JSON)</p>
                </div>
                <button
                  onClick={handleExportData}
                  disabled={exporting}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors"
                >
                  {exporting ? 'Exporting...' : 'Export JSON'}
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">
                <div>
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">Delete Account & Data</h4>
                  <p className="text-[11px] text-red-500/80 dark:text-red-400/70">Permanently erase your user profile and all tracked items</p>
                </div>
                <button
                  onClick={() => { setDeleteConfirmText(''); setDeleteModal(true); }}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end">
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline flex items-center gap-1"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Edit Profile & Photo Modal */}
      <Modal open={editNameModal} onClose={() => setEditNameModal(false)} title="Edit Profile Details">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#3d7a75] text-slate-900 dark:text-slate-100"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Profile Photo</label>
            <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-600 flex items-center justify-center text-slate-400 flex-shrink-0 shadow-xs relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <Camera size={26} className="text-slate-400" />
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
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white cursor-pointer transition-all shadow-xs active:scale-95"
                  >
                    <Upload size={14} /> Choose Image File
                  </label>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 size={13} /> Remove Photo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Select any photo from your phone or computer (max 5MB).</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditNameModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingName}
              className="px-4 py-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-semibold text-xs rounded-xl transition-colors shadow-xs"
            >
              {savingName ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal open={deleteModal} onClose={() => !deleting && setDeleteModal(false)} title="Delete Account & All Data">
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl text-xs text-red-700 dark:text-red-300 space-y-2">
            <p className="font-bold text-sm">Warning: This action is permanent and irreversible!</p>
            <p>All your habits, streak history, goals, milestones, reminders, and learning journeys will be permanently erased.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </label>
            <input
              required
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting || deleteConfirmText.trim() !== 'DELETE'}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors shadow-xs"
            >
              {deleting ? 'Erasing Account...' : 'Permanently Delete My Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
