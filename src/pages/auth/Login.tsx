import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  FileText,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/authStore';
import { PrimeStockLogo } from '../../components/shared/PrimeStockLogo';
import { ThemeToggleButton } from '../../components/shared/ThemeToggleButton';
import { getDefaultRouteForUser } from '../../utils/rbac';
import { getTrialDaysCount } from '../../utils/planLimits';

type AuthMode = 'signin' | 'signup' | 'reset';
type LegalDocType = 'terms' | 'privacy' | null;

const REMEMBERED_EMAIL_KEY = 'primestock_remembered_email';
const LEGAL_VERSION = '2026-11';

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
  const { user, isMasterAdmin, isLoading, isAuthenticating, authError, clearAuthError } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [activeLegalModal, setActiveLegalModal] = useState<LegalDocType>(null);
  const [resetSent, setResetSent] = useState(false);
  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(null);
  const [signupPromptNotice, setSignupPromptNotice] = useState<string | null>(null);

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

  if (user) return <Navigate to={getDefaultRouteForUser(user, isMasterAdmin)} replace />;

  const isBusy = isLoading || isAuthenticating;

  const switchMode = (nextMode: AuthMode) => {
    clearAuthError();
    setLegalError(null);
    setResetSent(false);
    setSignupSuccessEmail(null);
    setSignupPromptNotice(null);
    setMode(nextMode);
  };

  const redirectToSignup = (prefill: {
    email?: string;
    fullName?: string;
    notice: string;
  }) => {
    clearAuthError();
    setLegalError(null);
    setResetSent(false);
    setSignupSuccessEmail(null);
    if (prefill.email) setEmail(prefill.email);
    if (prefill.fullName) setFullName(prefill.fullName);
    setSignupPromptNotice(prefill.notice);
    setMode('signup');
  };

  const handleGoogleContinue = async () => {
    setLegalError(null);
    setSignupPromptNotice(null);
    if (mode === 'signup') {
      if (!legalAccepted) {
        setLegalError('Please accept the Terms of Service and Privacy Policy before registering.');
        return;
      }
      await loginWithGoogle({
        intent: 'signup',
        fullName,
        businessName,
        legalAcceptedAt: new Date().toISOString(),
        legalVersion: LEGAL_VERSION,
      });
      return;
    }
    const result = await loginWithGoogle({ intent: 'signin' });
    if (result.needsSignup) {
      redirectToSignup({
        email: result.email,
        fullName: result.fullName,
        notice: `No workspace is registered for ${
          result.email || 'this Google account'
        } yet. Complete sign-up below before logging in.`,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setResetSent(false);
    setSignupSuccessEmail(null);
    setSignupPromptNotice(null);
    setLegalError(null);

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
      const result = await loginWithEmail(email, password);
      if (result.needsSignup) {
        redirectToSignup({
          email: result.email || email.trim(),
          fullName: result.fullName,
          notice: `No account exists for ${
            result.email || email.trim()
          } yet. Complete your registration below before signing in.`,
        });
      }
      return;
    }

    if (mode === 'signup') {
      if (!legalAccepted) {
        setLegalError('You must agree to the Terms of Service and Privacy Policy to create your business workspace.');
        return;
      }
      const result = await registerWithEmail({
        fullName,
        businessName,
        email,
        password,
        legalAccepted: true,
        legalVersion: LEGAL_VERSION,
      });
      if (result.ok) {
        setEmail(result.email || email.trim());
        setPassword('');
        setFullName('');
        setBusinessName('');
        setLegalAccepted(false);
        setSignupPromptNotice(null);
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
    <div className="min-h-screen flex items-stretch bg-canvas">
      {/* Left Panel - Desktop Branding Showcase (hidden on mobile/tablet) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0B1F3A] border-r border-white/10 p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between text-xs font-semibold tracking-wider uppercase text-slate-300/80">
          <span>PRIMESTOCK BMS UG</span>
          <span>primestockug.com</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
          <div className="w-28 h-28 xl:w-32 xl:h-32 rounded-3xl bg-white p-3.5 shadow-2xl ring-4 ring-white/15 flex items-center justify-center mb-6">
            <img
              src="/assets/aistudio/Minimalist_Navy_Monogram_Emblem_804982e2.png"
              alt="PRIMESTOCK BMS UG logo"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-baseline justify-center gap-2">
            <span className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white">
              PRIMESTOCK
            </span>
            <span className="text-xs xl:text-sm font-extrabold tracking-[0.22em] text-teal-300 uppercase">
              BMS UG
            </span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mt-6 text-balance">
            Manage Smarter. <span className="text-slate-300">Grow Faster.</span>
          </h1>

          <p className="text-slate-300/85 text-base mt-3 max-w-md leading-relaxed">
            The unified point-of-sale, multi-branch inventory, accounting, and URA EFRIS platform built for Ugandan businesses.
          </p>

          <div className="grid grid-cols-3 gap-3 w-full mt-8 text-left">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-xs font-bold text-white">Offline-First POS</p>
              <p className="text-[11px] text-slate-300/75 mt-1">Sell without interruption</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-xs font-bold text-white">Multi-Branch</p>
              <p className="text-[11px] text-slate-300/75 mt-1">Real-time cloud sync</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-xs font-bold text-white">URA EFRIS Ready</p>
              <p className="text-[11px] text-slate-300/75 mt-1">VAT, PAYE &amp; NSSF</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between gap-4 text-xs text-slate-400">
          <span>Built &amp; managed by Novic Technologies</span>
          <span>Uganda Data Protection Act, 2019</span>
        </div>

        <div className="absolute top-[-12%] right-[-10%] w-[55%] h-[55%] bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-[#0F766E]/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-canvas">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-5 sm:p-8 shadow-soft">
          <div className="flex items-center justify-between gap-2 mb-6 lg:mb-4">
            <div className="lg:hidden">
              <PrimeStockLogo size="md" showTagline />
            </div>
            <div className="ml-auto">
              <ThemeToggleButton compact />
            </div>
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

          {(authError || legalError) && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg border border-danger/30 bg-danger/10 text-danger text-sm flex items-start gap-2.5"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p>{legalError || authError}</p>
                {mode === 'signin' && !legalError && authError && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        redirectToSignup({
                          email: email.trim(),
                          notice:
                            'New to PrimeStock? Complete your business registration below before signing in.',
                        })
                      }
                      className="text-xs font-bold underline underline-offset-2 text-primary hover:text-accent transition-colors"
                    >
                      New email? Sign up instead
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs font-semibold underline underline-offset-2 text-danger hover:opacity-80 transition-opacity"
                    >
                      Reset password instead
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {signupPromptNotice && mode === 'signup' && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg border border-accent/30 bg-accent/10 text-primary text-sm flex items-start gap-2.5"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-accent" />
              <span>{signupPromptNotice}</span>
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
                onClick={handleGoogleContinue}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-border bg-surface-alt/40 rounded-lg font-bold text-primary hover:bg-surface-alt transition-all active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none min-h-[48px] whitespace-nowrap"
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
                  <span className="px-3 bg-surface text-text-muted">Or use your credentials</span>
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

            {mode === 'signup' && (
              <div className="p-3 rounded-xl bg-surface-alt/70 border border-border">
                <label className="flex items-start gap-2.5 text-xs text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={legalAccepted}
                    onChange={(e) => {
                      setLegalAccepted(e.target.checked);
                      if (e.target.checked) setLegalError(null);
                    }}
                    className="mt-0.5 rounded border-border text-accent focus:ring-accent shrink-0"
                  />
                  <span className="leading-relaxed">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setActiveLegalModal('terms')}
                      className="font-bold text-accent hover:underline"
                    >
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={() => setActiveLegalModal('privacy')}
                      className="font-bold text-accent hover:underline"
                    >
                      Privacy Policy
                    </button>
                    , and confirm authority to process my business, customer, and staff payroll records under Uganda&apos;s Data Protection and Privacy Act.
                  </span>
                </label>
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

          <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-text-muted">
            <button
              type="button"
              onClick={() => setActiveLegalModal('terms')}
              className="hover:text-primary transition-colors"
            >
              Terms of Service
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveLegalModal('privacy')}
              className="hover:text-primary transition-colors"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">·</span>
            <a
              href="/PrimeStock-BMS-System-Guide.pdf"
              download="PrimeStock-BMS-System-Guide.pdf"
              className="hover:text-accent font-semibold transition-colors"
            >
              System Guide (PDF)
            </a>
            <span aria-hidden="true">·</span>
            <span>v{LEGAL_VERSION}</span>
          </div>
        </div>
      </div>

      {/* Terms of Service & Privacy Policy Modal */}
      {activeLegalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeLegalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 bg-surface-alt/60">
              <div className="flex items-center gap-2.5">
                {activeLegalModal === 'terms' ? (
                  <FileText size={18} className="text-accent" />
                ) : (
                  <ShieldCheck size={18} className="text-accent" />
                )}
                <div>
                  <h3 className="text-base font-bold text-primary">
                    {activeLegalModal === 'terms'
                      ? 'PrimeStock BMS Terms of Service'
                      : 'PrimeStock BMS Privacy & Data Protection Policy'}
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    Effective Version {LEGAL_VERSION} · Republic of Uganda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveLegalModal(null)}
                aria-label="Close document"
                className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-surface-alt"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs text-text-secondary leading-relaxed">
              {activeLegalModal === 'terms' ? (
                <>
                  <p>
                    <strong className="text-primary">1. Scope of Service:</strong> PrimeStock BMS
                    (hosted at <strong className="text-primary">primestockug.com</strong> and
                    operated by Novic Technologies) provides multi-tenant inventory, point-of-sale,
                    accounting, payroll, and URA EFRIS readiness software for merchants in Uganda
                    and East Africa.
                  </p>
                  <p>
                    <strong className="text-primary">2. Merchant Ownership &amp; Responsibility:</strong>{' '}
                    You retain full legal ownership of your sales, customer, supplier, and employee
                    records. You are responsible for verifying statutory tax filings (URA VAT, PAYE,
                    NSSF, and EFRIS fiscalization codes) prior to official submission.
                  </p>
                  <p>
                    <strong className="text-primary">3. Subscriptions, Trials &amp; Overdue Lock:</strong>{' '}
                    Workspaces begin with a free trial period. Upon expiry without an active plan
                    renewal, write access is automatically restricted while allowing read/export of
                    your existing business data.
                  </p>
                  <p>
                    <strong className="text-primary">4. AI Copilot &amp; Usage Quotas:</strong>{' '}
                    AI-powered demand forecasts, document OCR, and natural-language queries operate
                    within daily plan allowances enforced per workspace and provide advisory estimates.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong className="text-primary">1. Compliance Framework:</strong> We process
                    business, customer, and employee payroll information in alignment with the{' '}
                    <strong>Uganda Data Protection and Privacy Act, 2019</strong>.
                  </p>
                  <p>
                    <strong className="text-primary">2. Strict Tenant Isolation:</strong> Each
                    business workspace resides in a logically isolated tenant partition secured by
                    role-based access control and authenticated Firebase tokens. Staff members only
                    access sections permitted by the workspace administrator.
                  </p>
                  <p>
                    <strong className="text-primary">3. Offline Sync &amp; Local Storage:</strong>{' '}
                    To guarantee uninterrupted POS operation during network outages, working records
                    are cached locally in IndexedDB inside your browser and synced encrypted over
                    HTTPS when connectivity returns.
                  </p>
                  <p>
                    <strong className="text-primary">4. Retention &amp; Deletion:</strong> Workspace
                    administrators may permanently erase their business account and all tenant
                    subcollections at any time from Settings &rarr; Security &amp; Account Deletion.
                  </p>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-border bg-surface-alt/40 flex items-center justify-between gap-3">
              {mode === 'signup' ? (
                <button
                  type="button"
                  onClick={() => {
                    setLegalAccepted(true);
                    setLegalError(null);
                    setActiveLegalModal(null);
                  }}
                  className="btn btn-primary text-xs py-2 px-4 ml-auto"
                >
                  Accept &amp; Continue Signup
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveLegalModal(null)}
                  className="btn btn-secondary text-xs py-2 px-4 ml-auto"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

