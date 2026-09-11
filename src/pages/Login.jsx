import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';
import { ListChecks, Mail, Lock, UserPlus, LogIn, Eye, EyeOff, Sparkles } from 'lucide-react';

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
        setInfo('Account created! Check your email inbox to confirm your account and sign in to HabitTracker.');
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
          <div className="w-10 h-10 bg-gradient-to-br from-[#3d7a75] to-[#2d3f56] rounded-xl flex items-center justify-center shadow-lg shadow-black/30">
            <ListChecks className="text-white" size={22} />
          </div>
          <span className="text-white font-bold text-xl">HabitTracker</span>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#3d7a75]/20 border border-[#3d7a75]/30 rounded-full">
            <Sparkles size={14} className="text-[#8fd0c4]" />
            <span className="text-[#8fd0c4] text-xs font-medium">Build habits that stick</span>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Small habits,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8fd0c4] to-[#5fae9e]">
              massive results.
            </span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
            Track daily habits, set meaningful goals, and watch your streaks grow — one day at a time.
          </p>

          {/* Features list */}
          <ul className="space-y-3">
            {['Daily habit tracking with streaks', 'Smart reminders & notifications', 'Visual progress reports'].map((f) => (
              <li key={f} className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-5 h-5 rounded-full bg-[#3d7a75]/30 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-[#8fd0c4]" />
                </div>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Testimonial */}
        <div className="relative bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-slate-300 text-sm italic leading-relaxed">
            "HabitTracker changed how I approach my daily routine. My productivity has never been higher."
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3d7a75] to-[#5fae9e] flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="text-slate-400 text-xs">Alex M. · Product Designer</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white dark:bg-[#1a2129] rounded-3xl shadow-2xl shadow-black/30 p-8 border border-transparent dark:border-[#2a343d]">
            {/* Mobile logo */}
            <div className="flex items-center gap-2.5 mb-7 lg:hidden">
              <div className="w-9 h-9 bg-gradient-to-br from-[#3d7a75] to-[#2d3f56] rounded-xl flex items-center justify-center">
                <ListChecks className="text-white" size={19} />
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-lg">HabitTracker</span>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isSignUp ? 'Create account' : 'Welcome back'}
            </h2>
            <p className="text-gray-500 text-sm mb-7">
              {isSignUp
                ? 'Start your journey to better habits today.'
                : 'Sign in to continue your habit streak.'}
            </p>

            {/* Google Button */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-xl font-medium text-sm transition-all duration-150 mb-5 disabled:opacity-60 shadow-sm"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-gray-100" />
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

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              {info && (
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-100 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-green-700">{info}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white py-3 rounded-xl font-semibold text-sm transition-all duration-150 shadow-md shadow-[#3d7a75]/20 hover:shadow-[#3d7a75]/30 disabled:opacity-60 mt-1"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isSignUp ? (
                  <><UserPlus size={16} /> Create Account</>
                ) : (
                  <><LogIn size={16} /> Sign In</>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-5">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={switchMode}
                className="text-[#3d7a75] dark:text-[#5fae9e] font-semibold hover:underline"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
