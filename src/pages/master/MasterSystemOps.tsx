import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { SweepReport, useMasterAdmin } from '../../hooks/useMasterAdmin';
import { useAuthStore } from '../../store/authStore';
import { usePlatformPlansConfig } from '../../utils/platformPlans';
import {
  EmailServiceStatus,
  getNotificationServiceStatus,
  sendTestEmail,
} from '../../services/notificationService';
import { triggerServerExpirySweep } from '../../services/aiService';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function MasterSystemOps() {
  const { user, isMasterAdmin } = useAuthStore();
  const { organizations, isActing, runSubscriptionSweep } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();

  const [serviceStatus, setServiceStatus] = useState<EmailServiceStatus | null>(null);
  const [testEmailTo, setTestEmailTo] = useState(user?.email || '');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isRunningServerSweep, setIsRunningServerSweep] = useState(false);
  const [serverSweepResult, setServerSweepResult] = useState<{
    checkedCount: number;
    lockedCount: number;
    remindedCount: number;
    emailedCount: number;
    ranAt: string;
  } | null>(null);
  const [testEmailResult, setTestEmailResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [lastSweep, setLastSweep] = useState<SweepReport | null>(null);

  const refreshStatus = useCallback(() => {
    if (!isMasterAdmin) return;
    getNotificationServiceStatus()
      .then((res) => setServiceStatus(res))
      .catch(() => {});
  }, [isMasterAdmin]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (user?.email && !testEmailTo) {
      setTestEmailTo(user.email);
    }
  }, [user?.email, testEmailTo]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo.trim()) return;
    setIsTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await sendTestEmail(testEmailTo.trim());
      if (res.sent) {
        setTestEmailResult({
          ok: true,
          message: `Verification email sent via ${res.provider?.toUpperCase() || 'SMTP'} (${res.fromAddress || 'configured sender'}).`,
        });
      } else {
        setTestEmailResult({
          ok: false,
          message: res.error || 'Email transport not configured or failed.',
        });
      }
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleRunSweep = async () => {
    const report = await runSubscriptionSweep();
    setLastSweep(report);
  };

  const handleRunServerCronSweep = async () => {
    setIsRunningServerSweep(true);
    try {
      const res = await triggerServerExpirySweep();
      setServerSweepResult({ ...res, ranAt: new Date().toISOString() });
      toast.success(
        `Backend sweep completed: ${res.checkedCount} checked, ${res.lockedCount} locked, ${res.emailedCount} emailed`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Backend cron sweep failed');
    } finally {
      setIsRunningServerSweep(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary tracking-tight">
          System Operations &amp; Automated Sweeps
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Run expiry &amp; pre-renewal reminder sweeps across all tenant workspaces, verify email/WhatsApp delivery, and monitor live webhook &amp; cron endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Expiry & Reminder Sweep */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <RefreshCw size={18} className="text-accent" />
            <h2 className="text-sm font-bold text-primary">
              Platform Expiry &amp; Reminder Sweep
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-surface-alt border border-border text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-text-muted">Configured Trial Window</span>
              <strong className="font-mono tabular-nums text-primary">
                {plansConfig.trialDays} days
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Pre-Expiry Reminder Lead</span>
              <strong className="font-mono tabular-nums text-primary">
                {plansConfig.reminderLeadDays} days before expiry
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Auto-Lock Overdue Orgs</span>
              <strong
                className={
                  plansConfig.autoLockExpired ? 'text-accent' : 'text-amber-600 dark:text-amber-400'
                }
              >
                {plansConfig.autoLockExpired ? 'Enabled' : 'Disabled (Alerts Only)'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Strict Quota Enforcement</span>
              <strong
                className={
                  plansConfig.strictEnforcement ? 'text-accent' : 'text-amber-600 dark:text-amber-400'
                }
              >
                {plansConfig.strictEnforcement ? 'Enforced' : 'Advisory'}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isActing || organizations.length === 0}
              onClick={handleRunSweep}
              className="btn btn-primary w-full py-2.5 text-xs gap-1.5 whitespace-nowrap"
            >
              <RefreshCw size={14} className={isActing ? 'animate-spin' : ''} />
              Run Console Sweep ({organizations.length})
            </button>
            <button
              type="button"
              disabled={isRunningServerSweep}
              onClick={handleRunServerCronSweep}
              className="btn btn-secondary w-full py-2.5 text-xs gap-1.5 whitespace-nowrap"
            >
              <Server size={14} className={isRunningServerSweep ? 'animate-pulse text-accent' : 'text-accent'} />
              {isRunningServerSweep ? 'Running Server Job...' : 'Run Server Cron Sweep'}
            </button>
          </div>

          {serverSweepResult && (
            <div className="p-4 rounded-xl border border-accent/30 bg-accent/5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-primary flex items-center gap-1.5">
                  <Clock size={14} className="text-accent" />
                  Server Cron Job Executed
                </p>
                <span className="text-[11px] font-mono text-text-muted">
                  {new Date(serverSweepResult.ranAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <p className="text-[10px] text-text-muted uppercase">Checked</p>
                  <p className="font-mono font-bold text-primary mt-0.5">
                    {serverSweepResult.checkedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <p className="text-[10px] text-text-muted uppercase">Locked</p>
                  <p className="font-mono font-bold text-danger mt-0.5">
                    {serverSweepResult.lockedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <p className="text-[10px] text-text-muted uppercase">Reminded</p>
                  <p className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {serverSweepResult.remindedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <p className="text-[10px] text-text-muted uppercase">Emails</p>
                  <p className="font-mono font-bold text-accent mt-0.5">
                    {serverSweepResult.emailedCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {lastSweep && (
            <div className="p-4 rounded-xl border border-border space-y-3 text-xs">
              <p className="font-bold text-primary">Latest Console Sweep Report</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-surface-alt">
                  <p className="text-[10px] text-text-muted uppercase">Checked</p>
                  <p className="font-mono font-bold text-primary mt-0.5">
                    {lastSweep.checkedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface-alt">
                  <p className="text-[10px] text-text-muted uppercase">Locked</p>
                  <p className="font-mono font-bold text-danger mt-0.5">
                    {lastSweep.lockedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface-alt">
                  <p className="text-[10px] text-text-muted uppercase">Reminded</p>
                  <p className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {lastSweep.remindedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-surface-alt">
                  <p className="text-[10px] text-text-muted uppercase">Emails</p>
                  <p className="font-mono font-bold text-accent mt-0.5">
                    {lastSweep.emailedCount}
                  </p>
                </div>
              </div>

              {lastSweep.whatsappLinks.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <p className="font-semibold text-text-secondary">
                    Direct WhatsApp Fallback Links ({lastSweep.whatsappLinks.length})
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {lastSweep.whatsappLinks.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-surface-alt hover:bg-border/60 text-accent font-medium"
                      >
                        <span className="truncate">{item.tenantName}</span>
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-4 rounded-xl border border-border text-xs space-y-2">
            <p className="font-bold text-primary flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-accent" />
              Automated Scheduler &amp; Webhook Endpoints
            </p>
            <p className="text-text-secondary">
              Daily Cron Endpoint:{' '}
              <code className="font-mono font-semibold text-primary">
                POST /api/cron/subscription-sweep
              </code>
            </p>
            <p className="text-text-muted">
              Schedule Cloud Scheduler or cron-job.org daily with header{' '}
              <code className="font-mono">x-cron-secret: &lt;CRON_SECRET&gt;</code> (requires Firestore access token or Master Admin Bearer token).
            </p>
            <p className="text-text-secondary pt-1">
              Flutterwave Webhook:{' '}
              <code className="font-mono font-semibold text-primary">
                POST /api/webhooks/flutterwave
              </code>
            </p>
            <p className="text-text-muted">
              Uses server-side <code className="font-mono">FLUTTERWAVE_SECRET_KEY</code> and{' '}
              <code className="font-mono">FLUTTERWAVE_SECRET_HASH</code> with durable disk persistence across server restarts.
            </p>
          </div>
        </div>

        {/* Transactional Email & WhatsApp Transport */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Mail size={18} className="text-accent" />
              <h2 className="text-sm font-bold text-primary">
                Transactional Email &amp; WhatsApp Transport
              </h2>
            </div>
            <button
              type="button"
              onClick={refreshStatus}
              className="btn btn-secondary text-xs py-1.5 px-3 min-h-[32px] gap-1 whitespace-nowrap"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          <div className="p-4 rounded-xl bg-surface-alt border border-border text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-text-muted">Transport Status</span>
              <strong
                className={
                  serviceStatus?.configured ? 'text-accent' : 'text-danger'
                }
              >
                {serviceStatus?.configured ? 'Configured & Ready' : 'Not Configured'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Active Provider</span>
              <span className="font-mono font-bold text-primary">
                {serviceStatus?.configured
                  ? `${serviceStatus.provider.toUpperCase()}${
                      serviceStatus.host ? ` (${serviceStatus.host})` : ''
                    }`
                  : 'None'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-text-muted">Sender Address</span>
              <span className="font-mono text-primary truncate">
                {serviceStatus?.fromAddress || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">WhatsApp Cloud API</span>
              <span className="font-semibold text-primary">
                {serviceStatus?.whatsappConfigured
                  ? 'API Live'
                  : 'Pre-filled wa.me links'}
              </span>
            </div>
          </div>

          {!serviceStatus?.configured && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-primary space-y-1">
              <p className="font-bold">Environment Secrets Required for Email:</p>
              <p className="text-text-secondary">
                Set <code className="font-mono font-bold text-primary">RESEND_API_KEY</code> (+ optional{' '}
                <code className="font-mono font-bold text-primary">RESEND_FROM</code>) or{' '}
                <code className="font-mono font-bold text-primary">SMTP_USER</code> /{' '}
                <code className="font-mono font-bold text-primary">SMTP_PASS</code> on the server.
              </p>
            </div>
          )}

          <form onSubmit={handleSendTest} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                Send Verification Test Email To
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  className="input flex-1 text-xs"
                  placeholder="owner@business.co.ug"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={isTestingEmail}
                  className="btn btn-primary text-xs py-2 px-4 gap-1.5 whitespace-nowrap"
                >
                  <Send size={13} />
                  {isTestingEmail ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>

            {testEmailResult && (
              <div
                className={cn(
                  'p-3 rounded-lg text-xs font-medium border',
                  testEmailResult.ok
                    ? 'bg-accent/10 border-accent/30 text-primary'
                    : 'bg-danger/10 border-danger/30 text-danger'
                )}
              >
                {testEmailResult.message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
