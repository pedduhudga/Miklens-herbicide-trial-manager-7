import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useAppState } from '../hooks/useAppState.jsx';
import { Lock, User, Key, Eye, EyeOff, AlertCircle, ShieldCheck, Mail, X, Sprout, ArrowRight, HelpCircle } from 'lucide-react';
import { fbResetPassword } from '../services/firebaseAuth.js';

export default function Login() {
  const { login } = useAuth();
  const { state, dispatch } = useAppState();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const firebaseEnabled = !!state.settings?.firebaseEnabled;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(username, password);

    if (!result.success) {
      setError(result.message || 'Login failed. Please check your credentials.');
      setIsLoading(false);
    }
  };

  const handleResetSettings = () => {
    if (window.confirm('Reset server connection settings? This will log you out.')) {
      dispatch({ type: 'RESET_SETTINGS' });
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      setForgotError('Please enter a valid email address.');
      return;
    }
    setForgotError('');
    setForgotSuccess('');
    setForgotLoading(true);

    try {
      const res = await fbResetPassword(forgotEmail.trim());
      if (res.success) {
        setForgotSuccess('Password reset link sent! Please check your email inbox.');
        setForgotEmail('');
      } else {
        setForgotError(res.message || 'Failed to send reset email.');
      }
    } catch (err) {
      setForgotError(err.message || 'An error occurred. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#020617] flex z-[20000] overflow-hidden text-slate-100 font-sans">
      
      {/* Top right "Need Help" badge */}
      <div className="absolute top-6 right-6 z-30">
        <a 
          href="mailto:support@miklens.com" 
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition text-xs font-semibold text-slate-300"
        >
          <HelpCircle className="w-4 h-4 text-emerald-400" />
          <span>Need help?</span>
        </a>
      </div>

      {/* Left Section - Graphic & Highlights (Hidden on Mobile) */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-16">
        {/* Background Image */}
        <img
          src="/farm-bg.jpg"
          alt="Herbicide Trial Field"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />

        {/* Ambient Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617] via-[#020617]/90 to-transparent"></div>

        {/* Top Branding Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Sprout className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight tracking-wide">Miklens</h2>
            <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Bio Pvt. Ltd.</p>
          </div>
        </div>

        {/* Main Title & Features */}
        <div className="relative z-10 my-auto max-w-lg">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            Advancing Agricultural Research
          </span>
          <h1 className="text-5xl font-extrabold leading-tight text-white mt-6">
            Miklens <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Trial Manager
            </span>
          </h1>

          <p className="mt-4 text-slate-400 text-lg leading-relaxed">
            Smart Trial Management. Accurate Results. Better Tomorrow.
          </p>

          <div className="mt-10 space-y-6">
            <FeatureItem 
              title="Field Trial Management" 
              description="Plan, execute and monitor trials seamlessly" 
            />
            <FeatureItem 
              title="Real-time Analytics" 
              description="Get real-time insights and advanced reports" 
            />
            <FeatureItem 
              title="Secure & Reliable" 
              description="Enterprise-grade security for your data" 
            />
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-slate-500 bg-white/5 border border-white/5 px-4 py-2.5 rounded-xl w-fit">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Trusted by Researchers. Powered by Innovation.</span>
        </div>
      </div>

      {/* Right Section - Login Card Container */}
      <div className="flex-1 flex flex-col justify-between items-center p-6 lg:p-12 relative overflow-hidden">
        
        {/* Background Ambient Glows */}
        <div className="absolute top-20 left-20 w-96 h-96 bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none"></div>

        {/* Empty spacer for alignment */}
        <div className="hidden lg:block h-6"></div>

        {/* Main Login Card */}
        <div className="w-full max-w-lg backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-[32px] shadow-[0_0_50px_rgba(16,185,129,0.08)] p-8 lg:p-10 relative z-10 my-auto">
          
          {/* Circular Icon Header */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-float">
              <Sprout className="w-10 h-10 text-[#020617]" />
            </div>
          </div>

          <h2 className="text-center text-white text-4xl font-bold tracking-tight">
            Welcome Back
          </h2>

          <p className="text-center text-slate-400 mt-2 text-sm">
            Sign in to manage your trials.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300 font-medium">{error}</p>
              </div>
            )}

            {/* Email/Username field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full h-14 pl-12 pr-5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                  placeholder="pavanbdvt13@gmail.com"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                {firebaseEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotError('');
                      setForgotSuccess('');
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold focus:outline-none transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-14 pl-12 pr-12 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex="-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 mt-2 rounded-2xl text-base font-semibold text-[#020617] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          {/* Reset Server connection settings button */}
          <div className="mt-6 pt-5 border-t border-white/5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleResetSettings}
              className="text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors"
            >
              Reset Server Connection Settings
            </button>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/60" />
              <span>Secure Multi-User Authentication Active</span>
            </div>
          </div>
        </div>

        {/* Bottom copyright footer */}
        <div className="text-center text-xs text-slate-500 mt-6 relative z-10 w-full flex flex-col sm:flex-row justify-between items-center gap-2 px-6">
          <span>Version 3.0.0</span>
          <span>© 2026 Miklens Bio Pvt. Ltd. All rights reserved.</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0b1329] border border-white/10 rounded-[32px] shadow-2xl w-full max-w-md p-6 space-y-4 relative animate-[modalPopIn_0.3s_ease-out]">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute right-4 top-4 p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center pb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-950/50 text-emerald-400 border border-emerald-800/30 mb-3 animate-[pulse_2s_infinite]">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-slate-100">Forgot Password</h3>
              <p className="text-xs text-slate-400 mt-1">Enter your registered email address below, and we'll send you a password reset link.</p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              {forgotError && (
                <div className="flex items-center gap-2.5 p-3 bg-red-950/40 border border-red-800/50 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-300 font-medium">{forgotError}</p>
                </div>
              )}
              {forgotSuccess && (
                <div className="flex items-center gap-2.5 p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300 font-medium">{forgotSuccess}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-100 placeholder:text-slate-600 text-sm transition-all focus:bg-slate-950"
                  placeholder="e.g. user@example.com"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-[#020617] font-bold rounded-xl text-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponents
function FeatureItem({ title, description }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
        <Sprout className="w-5 h-5 text-emerald-400" />
      </div>
      <div>
        <h3 className="font-semibold text-white text-base leading-snug">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}


