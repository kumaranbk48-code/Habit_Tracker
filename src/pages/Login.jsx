import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';
import { ListChecks, Mail, Lock, UserPlus, LogIn, Eye, EyeOff, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const validateInputs = () => {
    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail) {
      return 'Please enter your email address.';
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return 'Please enter a valid email address.';
    }
    if (!cleanPassword) {
      return 'Password is required.';
    }
    if (isSignUp && cleanPassword.length < 6) {
      return 'Password must be at least 6 characters long.';
    }
    return null;
  };

  const handleEmailBlur = () => {
    const cleanEmail = email.trim();
    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      setEmailError('Please enter a valid email address.');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setEmailError('');

    const validationErr = validateInputs();
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password: cleanPassword });
      if (error) {
        setError(error.message);
      } else if (data?.session) {
        navigate('/');
      } else {
        setInfo('Account created! Check your email inbox to confirm your account and sign in to HabiZ.');
        setIsSignUp(false);
        setPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
      if (error) {
        setError(error.message);
      } else {
        navigate('/');
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
    setGoogleLoading(false);
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setInfo('');
    // Fix: clear password when switching between sign-in and sign-up modes
    // to avoid confusing state where stale password stays in the field
    setPassword('');
  };

  // Show nothing while auth state is being determined to prevent flash
  if (authLoading) return null;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#14181c] via-[#1c2734] to-[#1f3a3a]">
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#3d7a75]/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -right-24 w-80 h-80 bg-[#2d3f56]/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 w-72 h-72 bg-[#5fae9e]/10 rounded-full blur-3xl" />
        </div>

        {/* Logo */}
        <div className="flex items-center gap-3 relative">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center p-1.5 shadow-md ring-1 ring-[#2dd4bf]/25 bg-[#0b131a] relative overflow-hidden">
            <div className="absolute inset-0 bg-[#2dd4bf]/10 blur-sm" />
            <img src="/habiz-logo.png" alt="HabiZ" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
          </div>
          <span className="text-white font-extrabold text-2xl tracking-tight">HabiZ</span>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500/15 border border-teal-500/25 rounded-full">
            <Sparkles size={14} className="text-teal-300" />
            <span className="text-teal-300 text-xs font-semibold">Small habits. Big shifts.</span>
          </div>
          <h2 className="text-4xl font-black text-white leading-tight">
            Small habits,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2dd4bf] to-[#178274]">
              massive shifts.
            </span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Track daily rituals, master learning tracks, and turn consistency into second nature.
          </p>

          {/* Features list */}
          <ul className="space-y-3">
            {['Daily habit tracking with streaks', 'Full-screen alarms & smart pings', 'Learning Roadmaps & Goal progress'].map((f) => (
              <li key={f} className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-teal-400" />
                </div>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Testimonial */}
        <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
          <p className="text-slate-300 text-sm italic leading-relaxed">
            "HabiZ changed how I approach my daily routine. Progress isn't loud, it's consistent."
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-7 h-7 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-xs">
              H
            </div>
            <span className="text-slate-400 text-xs">HabiZ Member</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="habiz-panel rounded-3xl p-8 border border-white/[0.08] shadow-2xl"
          >
            {/* Mobile logo */}
            <div className="flex items-center gap-2.5 mb-6 lg:hidden">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center p-1.5 shadow-md ring-1 ring-[#2dd4bf]/25 bg-[#0b131a] relative overflow-hidden">
                <div className="absolute inset-0 bg-[#2dd4bf]/10 blur-sm" />
                <img src="/habiz-logo.png" alt="HabiZ" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_6px_rgba(45,212,191,0.5)]" />
              </div>
              <span className="font-extrabold text-white text-xl tracking-tight">HabiZ</span>
            </div>

            {/* Framer Motion Segmented Auth Switcher Tabs */}
            <div className="flex bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06] mb-6 relative select-none">
              <button
                type="button"
                onClick={() => { if (isSignUp) switchMode(); }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl relative transition-colors cursor-pointer text-center z-10 ${
                  !isSignUp ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {!isSignUp && (
                  <motion.div
                    layoutId="activeAuthTab"
                    className="absolute inset-0 bg-[#122e2c] border border-teal-500/35 rounded-xl shadow-xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  <LogIn size={13} /> Sign In
                </span>
              </button>

              <button
                type="button"
                onClick={() => { if (!isSignUp) switchMode(); }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl relative transition-colors cursor-pointer text-center z-10 ${
                  isSignUp ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isSignUp && (
                  <motion.div
                    layoutId="activeAuthTab"
                    className="absolute inset-0 bg-[#122e2c] border border-teal-500/35 rounded-xl shadow-xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  <UserPlus size={13} /> Create Account
                </span>
              </button>
            </div>

            <h2 className="text-2xl font-black text-white mb-1">
              {isSignUp ? 'Create account' : 'Welcome back'}
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              {isSignUp
                ? 'Start your journey with HabiZ today.'
                : 'Sign in to continue your habit streak.'}
            </p>

            {/* Google Button */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 border border-white/[0.1] hover:border-white/[0.2] bg-white/[0.04] hover:bg-white/[0.07] text-white py-3 rounded-xl font-medium text-sm transition-colors mb-5 disabled:opacity-60 shadow-sm cursor-pointer"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="email"
                    value={email}
                    onBlur={handleEmailBlur}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                      if (error) setError('');
                    }}
                    className={`w-full pl-10 pr-4 py-3 border ${
                      emailError ? 'border-red-400 focus:ring-red-500' : 'border-gray-200 dark:border-[#2a343d] focus:ring-[#3d7a75] focus:border-[#3d7a75]'
                    } rounded-xl focus:ring-2 outline-none text-sm transition-colors bg-gray-50 dark:bg-[#14181c] focus:bg-white dark:focus:bg-[#1a2129] text-gray-900 dark:text-white`}
                    placeholder="you@example.com"
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-500 font-medium mt-1">{emailError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 border border-gray-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] focus:border-[#3d7a75] outline-none text-sm transition-colors bg-gray-50 dark:bg-[#14181c] focus:bg-white dark:focus:bg-[#1a2129] text-gray-900 dark:text-white"
                    placeholder="••••••••"
                    minLength={isSignUp ? 6 : undefined}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Fix: show password hint for sign-up so user knows minimum length */}
                {isSignUp && (
                  <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
                )}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">{error}</p>
                  </motion.div>
                )}
                {info && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-green-300">{info}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#178274] hover:bg-[#136c60] text-white py-3 rounded-xl font-bold text-sm transition-colors shadow-md shadow-teal-950/40 disabled:opacity-60 mt-1 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isSignUp ? (
                  <><UserPlus size={16} /> Create Account</>
                ) : (
                  <><LogIn size={16} /> Sign In</>
                )}
              </motion.button>
            </form>

            <p className="text-center text-sm text-slate-400 mt-5">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={switchMode}
                className="text-teal-400 font-bold hover:underline cursor-pointer"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
