import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Database, Trash2, Eye } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#080d12] text-[#f1f5f9] selection:bg-teal-500 selection:text-white py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Ambient background glows */}
      <div
        className="fixed top-0 right-1/4 w-[600px] h-[500px] pointer-events-none opacity-20 blur-[140px] rounded-full"
        style={{ background: 'radial-gradient(circle, #178274 0%, transparent 70%)' }}
      />

      <div className="max-w-3xl mx-auto space-y-8 relative z-10">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors"
          >
            <ArrowLeft size={16} /> Back to HabiZ
          </Link>
          <span className="text-xs text-slate-500">Effective Date: November 2026</span>
        </div>

        {/* Hero Section */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-xs font-semibold">
            <Shield size={14} />
            <span>Transparency & Data Security</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            HabiZ is built on the belief that personal self-improvement requires absolute privacy.
            We do not sell your personal data, we do not run behavioral advertising trackers, and
            your habit streaks belong strictly to you.
          </p>
        </div>

        {/* Main Sections */}
        <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Eye size={18} className="text-teal-400" /> 1. Information We Collect
            </h2>
            <p>We only collect information necessary to provide the habit tracking and self-mastery service:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong className="text-slate-200">Account Credentials:</strong> Email address and authentication tokens via Supabase Auth (or Google OAuth profile name and email if chosen).</li>
              <li><strong className="text-slate-200">Habit Records:</strong> Habit titles, categories, frequencies, colors, icons, and timestamps.</li>
              <li><strong className="text-slate-200">Progress & Notes:</strong> Completion dates, completed quantities, optional habit notes, and mood entries.</li>
              <li><strong className="text-slate-200">Goals & Learning Tracks:</strong> Target dates, milestones, progress values, topics, and task statuses.</li>
              <li><strong className="text-slate-200">Push Notification Subscriptions:</strong> Standard browser Web Push endpoint tokens if you voluntarily grant notification permissions.</li>
            </ul>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock size={18} className="text-teal-400" /> 2. Security Architecture & Tenant Isolation
            </h2>
            <p>
              Your data is isolated through multi-tenant database policies. We enforce strict PostgreSQL
              <strong className="text-white"> Row Level Security (RLS)</strong> on every single user table
              (<code>auth.uid() = user_id</code>). Other users cannot query, view, or alter your habit history,
              even by altering client queries or resource IDs.
            </p>
            <p>
              All traffic between your device and our servers is encrypted in transit using industry-standard
              TLS/HTTPS protocols.
            </p>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database size={18} className="text-teal-400" /> 3. Data Storage & Local Persistence
            </h2>
            <p>
              HabiZ stores your active session and display preferences (such as light/dark mode and dismissed notification IDs)
              in your browser's <code>localStorage</code>. These local storage keys are automatically cleared
              upon signing out of your account to prevent data leakage on shared workstations.
            </p>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trash2 size={18} className="text-teal-400" /> 4. GDPR & CCPA Rights (Export & Deletion)
            </h2>
            <p>We respect your international data sovereignty rights:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong className="text-slate-200">Right of Access & Portability:</strong> You can download a complete JSON export of all your habits, completions, goals, milestones, and learning history at any time from your Profile page.</li>
              <li><strong className="text-slate-200">Right to Erasure (Permanent Deletion):</strong> You can permanently delete your entire account and all associated database records directly from your Profile settings. This action permanently purges your records.</li>
            </ul>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">5. Third-Party Sub-Processors</h2>
            <p>We work exclusively with vetted operational service providers:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong className="text-slate-200">Supabase Inc:</strong> Encrypted PostgreSQL database hosting and identity authentication.</li>
              <li><strong className="text-slate-200">Web Push Services:</strong> Browser push notification delivery (Google FCM / Apple APNs).</li>
              <li><strong className="text-slate-200">Resend:</strong> Transactional email delivery for optional weekly habit digests.</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-500">
          <span>HabiZ Privacy Team</span>
          <Link to="/terms" className="text-teal-400 hover:underline">Read Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

