import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/authStore';
import { PrimeStockLogo } from '../../components/shared/PrimeStockLogo';
import { getDefaultRouteForUser } from '../../utils/rbac';
import { getTrialDaysCount } from '../../utils/planLimits';

type AuthMode = 'signin' | 'signup' | 'reset';

const REMEMBERED_EMAIL_KEY = 'primestock_remembered_email';

function GoogleLogo() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export default function Login() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const { user, isLoading, isAuthenticating, authError, clearAuthError } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberEmail(true);
      }
    } catch {
      // Ignore storage access failures
    }
  }, []);

  if (user) return <Navigate to={getDefaultRouteForUser(user)} replace />;

  const isBusy = isLoading || isAuthenticating;

  const switchMode = (nextMode: AuthMode) => {
    clearAuthError();
    setResetSent(false);
    setSignupSuccessEmail(null);
    setMode(nextMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setResetSent(false);
    setSignupSuccessEmail(null);

    if (mode === 'signin') {
      try {
        if (rememberEmail && email.trim()) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } catch {
        // Ignore storage errors
      }
      await loginWithEmail(email, password);
      return;
    }

    if (mode === 'signup') {
      const result = await registerWithEmail({
        fullName,
        businessName,
        email,
        password,
      });
      if (result.ok) {
        setEmail(result.email || email.trim());
        setPassword('');
        setFullName('');
        setBusinessName('');
        setMode('signin');
        setSignupSuccessEmail(result.email || email.trim());
      }
      return;
    }

    if (mode === 'reset') {
      const ok = await resetPassword(email);
      if (ok) {
        setResetSent(true);
      }
    }
  };

  const trialDaysCount = getTrialDaysCount();
  const headingText =
    mode === 'signin'
      ? 'Welcome Back'
      : mode === 'signup'
      ? `Start Your ${trialDaysCount}-Day Free Trial`
      : 'Reset Your Password';

  const subtitleText =
    mode === 'signin'
      ? 'Sign in to manage your business operations.'
      : mode === 'signup'
      ? 'Create your business workspace in under a minute.'
      : 'Enter your account email and we will send you a password reset link.';

  return (
    <div className="min-h-screen flex items-stretch bg-[#EDF1F6]">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0B1F3A] p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="mb-12">
            <PrimeStockLogo variant="light" size="lg" showTagline />
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight max-w-md text-balance">
            Manage Smarter. <br />
            <span className="text-slate-300">Grow Faster.</span>
          </h1>
          <p className="text-slate-300/80 text-lg mt-6 max-w-sm leading-relaxed">
            The professional, enterprise-grade management system built exclusively for Ugandan businesses.
          </p>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 text-slate-300/75 text-sm">
            <span>Offline-First</span>
            <span aria-hidden="true">·</span>
            <span>Multi-Tenant</span>
            <span aria-hidden="true">·</span>
            <span>URA Compliant</span>
          </div>
        </div>

        {/* Restrained architectural ambient highlights */}
        <div className="absolute top-[-10%] right-[-10%] w-[55%] h-[55%] bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#0F766E]/15 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-[#EDF1F6]">
        <div className="max-w-md w-full bg-[#FBFDFF] border border-border rounded-2xl p-5 sm:p-8 shadow-soft">
          <div className="lg:hidden mb-8">
            <PrimeStockLogo variant="dark" size="md" showTagline />
          </div>

          {mode !== 'signin' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-primary mb-4 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </button>
          )}

          <h2 className="text-2xl sm:text-3xl font-bold text-primary mb-2 text-balance">{headingText}</h2>
          <p className="text-text-secondary mb-6">{subtitleText}</p>

          {authError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm flex items-start gap-2.5"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {signupSuccessEmail && mode === 'signin' && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg border border-accent/30 bg-accent/10 text-primary text-sm flex items-start gap-2.5"
            >
              <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-accent" />
              <span>
                Account &amp; workspace created for <strong>{signupSuccessEmail}</strong>! Sign in below with your credentials to access your dashboard.
              </span>
            </div>
          )}

          {resetSent && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg border border-accent/30 bg-accent/10 text-primary text-sm flex items-start gap-2.5"
            >
              <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-accent" />
              <span>
                If an email/password account exists for <strong>{email.trim()}</strong>, a password reset link has been sent. Please check your inbox and spam folder.
              </span>
            </div>
          )}

          {mode !== 'reset' && (
            <>
              <button
                type="button"
                onClick={loginWithGoogle}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-border rounded-lg font-bold text-primary hover:bg-surface-alt transition-all active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none min-h-[48px] whitespace-nowrap"
              >
                {isAuthenticating ? (
                  <Loader2 size={18} className="animate-spin shrink-0" />
                ) : (
                  <GoogleLogo />
                )}
                <span>{isAuthenticating ? 'Please wait...' : 'Continue with Google'}</span>
              </button>

              <div className="my-6 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-[#FBFDFF] text-text-muted">Or use your credentials</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <>
                <div>
                  <label htmlFor="auth-full-name" className="block text-sm font-bold text-primary mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="auth-full-name"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Sarah Namukasa"
                    className="input"
                    value={fullName}
                    onChange={(e) => {
                      clearAuthError();
                      setFullName(e.target.value);
                    }}
                    disabled={isBusy}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-business-name" className="block text-sm font-bold text-primary mb-1.5">
                    Business Name
                  </label>
                  <input
                    id="auth-business-name"
                    type="text"
                    autoComplete="organization"
                    placeholder="e.g. Kampala Fresh Mart"
                    className="input"
                    value={businessName}
                    onChange={(e) => {
                      clearAuthError();
                      setBusinessName(e.target.value);
                    }}
                    disabled={isBusy}
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-bold text-primary mb-1.5">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                className="input"
                value={email}
                onChange={(e) => {
                  clearAuthError();
                  setEmail(e.target.value);
                }}
                disabled={isBusy}
                required
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label htmlFor="auth-password" className="block text-sm font-bold text-primary mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                    className="input pr-12"
                    value={password}
                    onChange={(e) => {
                      clearAuthError();
                      setPassword(e.target.value);
                    }}
                    disabled={isBusy}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-primary rounded-md transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  Remember email
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-sm font-bold text-accent hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="btn btn-primary w-full py-3 text-base font-bold gap-2"
            >
              {isAuthenticating && <Loader2 size={18} className="animate-spin" />}
              <span>
                {mode === 'signin'
                  ? isAuthenticating
                    ? 'Signing In...'
                    : 'Sign In'
                  : mode === 'signup'
                  ? isAuthenticating
                    ? 'Creating Workspace...'
                    : 'Create Account'
                  : isAuthenticating
                  ? 'Sending Link...'
                  : resetSent
                  ? 'Resend Reset Link'
                  : 'Send Reset Link'}
              </span>
            </button>
          </form>

          {mode === 'signin' && (
            <p className="mt-6 text-center text-sm text-text-secondary">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-bold text-accent hover:underline"
              >
                Start {trialDaysCount}-day free trial
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p className="mt-6 text-center text-sm text-text-secondary">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-bold text-accent hover:underline"
              >
                Sign in
              </button>
            </p>
          )}

          {mode === 'reset' && (
            <p className="mt-6 text-center text-sm text-text-secondary">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-bold text-accent hover:underline"
              >
                Return to Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
