import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#080d12] text-[#f1f5f9] selection:bg-teal-500 selection:text-white py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Ambient background glows */}
      <div
        className="fixed top-0 left-1/4 w-[600px] h-[500px] pointer-events-none opacity-20 blur-[140px] rounded-full"
        style={{ background: 'radial-gradient(circle, #0e7490 0%, transparent 70%)' }}
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
            <FileText size={14} />
            <span>Usage Terms & Guidelines</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Please review these terms before using HabiZ. By creating an account or accessing the application,
            you agree to be bound by the terms outlined below.
          </p>
        </div>

        {/* Main Sections */}
        <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 size={18} className="text-teal-400" /> 1. Use of the Service
            </h2>
            <p>
              HabiZ is a personal productivity, habit cultivation, and learning roadmap platform designed
              to assist individuals in building daily routines, tracking goals, and monitoring habits over time.
            </p>
            <p>
              You agree to provide accurate registration information and to maintain the confidentiality of your
              login credentials. You are responsible for all actions conducted under your user account.
            </p>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertCircle size={18} className="text-teal-400" /> 2. Acceptable Conduct & Abuse Prevention
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>Attempt to bypass authentication, inspect other users' personal data, or breach database Row Level Security policies.</li>
              <li>Submit malicious code, oversized binary payloads, or abusive automated traffic designed to overwhelm server capacity.</li>
              <li>Impersonate other individuals or misuse push notification mechanisms.</li>
            </ul>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">3. Streaks, Gamification & AI Recommendations</h2>
            <p>
              HabiZ provides visual streaks, XP levels, and behavioral suggestions intended for motivational purposes.
              These indicators and AI-suggested habit routines do not constitute medical, psychological, or professional health advice.
              You remain solely responsible for your personal routines and well-being.
            </p>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">4. Account Termination & Data Erasure</h2>
            <p>
              You may stop using HabiZ and permanently delete your account at any time via Profile Settings.
              Upon account deletion, all personal records, habit logs, milestones, and notification tokens are
              permanently purged from active databases.
            </p>
          </section>

          <section className="bg-[#0e1620] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">5. Disclaimer of Warranties & Limitation of Liability</h2>
            <p>
              HabiZ is provided on an "as is" and "as available" basis without warranties of any kind, whether express or implied.
              We do not guarantee uninterrupted or error-free operation, although we strive for maximum stability and data safety.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-500">
          <span>HabiZ Terms Team</span>
          <Link to="/privacy" className="text-teal-400 hover:underline">Read Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

