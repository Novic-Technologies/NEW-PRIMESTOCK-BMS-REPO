import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
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
import { cn } from '../../lib/utils';

export default function MasterSystemOps() {
  const { user, isMasterAdmin } = useAuthStore();
  const { organizations, isActing, runSubscriptionSweep } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();

  const [serviceStatus, setServiceStatus] = useState<EmailServiceStatus | null>(null);
  const [testEmailTo, setTestEmailTo] = useState(user?.email || '');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F1E33] tracking-tight">
          System Operations &amp; Automated Sweeps
        </h1>
        <p className="text-sm text-[#475569] mt-0.5">
          Run expiry &amp; pre-renewal reminder sweeps across all tenant workspaces, verify email/WhatsApp delivery, and monitor live webhook endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Expiry & Reminder Sweep */}
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <RefreshCw size={18} className="text-[#0F766E]" />
            <h2 className="text-sm font-bold text-[#0F1E33]">
              Platform Expiry &amp; Reminder Sweep
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#D5DEE9] text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Configured Trial Window</span>
              <strong className="font-mono tabular-nums text-[#0F1E33]">
                {plansConfig.trialDays} days
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Pre-Expiry Reminder Lead</span>
              <strong className="font-mono tabular-nums text-[#0F1E33]">
                {plansConfig.reminderLeadDays} days before expiry
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Auto-Lock Overdue Orgs</span>
              <strong
                className={
                  plansConfig.autoLockExpired ? 'text-[#0F766E]' : 'text-amber-700'
                }
              >
                {plansConfig.autoLockExpired ? 'Enabled' : 'Disabled (Alerts Only)'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Strict Quota Enforcement</span>
              <strong
                className={
                  plansConfig.strictEnforcement ? 'text-[#0F766E]' : 'text-amber-700'
                }
              >
                {plansConfig.strictEnforcement ? 'Enforced' : 'Advisory'}
              </strong>
            </div>
          </div>

          <button
            type="button"
            disabled={isActing || organizations.length === 0}
            onClick={handleRunSweep}
            className="btn btn-primary w-full py-2.5 text-xs gap-1.5 whitespace-nowrap"
          >
            <RefreshCw size={14} className={isActing ? 'animate-spin' : ''} />
            Run Platform Sweep ({organizations.length} businesses)
          </button>

          {lastSweep && (
            <div className="p-4 rounded-xl border border-[#D5DEE9] space-y-3 text-xs">
              <p className="font-bold text-[#0F1E33]">Latest Sweep Report</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-[#F1F5F9]">
                  <p className="text-[10px] text-[#64748B] uppercase">Checked</p>
                  <p className="font-mono font-bold text-[#0F1E33] mt-0.5">
                    {lastSweep.checkedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-[#F1F5F9]">
                  <p className="text-[10px] text-[#64748B] uppercase">Locked</p>
                  <p className="font-mono font-bold text-red-600 mt-0.5">
                    {lastSweep.lockedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-[#F1F5F9]">
                  <p className="text-[10px] text-[#64748B] uppercase">Reminded</p>
                  <p className="font-mono font-bold text-amber-700 mt-0.5">
                    {lastSweep.remindedCount}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-[#F1F5F9]">
                  <p className="text-[10px] text-[#64748B] uppercase">Emails</p>
                  <p className="font-mono font-bold text-[#0F766E] mt-0.5">
                    {lastSweep.emailedCount}
                  </p>
                </div>
              </div>

              {lastSweep.whatsappLinks.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#D5DEE9]">
                  <p className="font-semibold text-[#475569]">
                    Direct WhatsApp Fallback Links ({lastSweep.whatsappLinks.length})
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {lastSweep.whatsappLinks.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#F1F5F9] hover:bg-[#F1F5F9] text-[#0F766E] font-medium"
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

          <div className="p-4 rounded-xl border border-[#D5DEE9] text-xs space-y-1.5">
            <p className="font-bold text-[#0F1E33] flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-[#0F766E]" />
              Live Flutterwave Webhook Listener
            </p>
            <p className="text-[#475569]">
              Endpoint: <code className="font-mono font-semibold text-[#0F1E33]">/api/webhooks/flutterwave</code>
            </p>
            <p className="text-[#64748B]">
              Uses server-side <code className="font-mono">FLUTTERWAVE_SECRET_KEY</code> and{' '}
              <code className="font-mono">FLUTTERWAVE_SECRET_HASH</code> for automated Uganda MoMo &amp; Card callback verification.
            </p>
          </div>
        </div>

        {/* Transactional Email & WhatsApp Transport */}
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Mail size={18} className="text-[#0F766E]" />
              <h2 className="text-sm font-bold text-[#0F1E33]">
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

          <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#D5DEE9] text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Transport Status</span>
              <strong
                className={
                  serviceStatus?.configured ? 'text-[#0F766E]' : 'text-red-600'
                }
              >
                {serviceStatus?.configured ? 'Configured & Ready' : 'Not Configured'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Active Provider</span>
              <span className="font-mono font-bold text-[#0F1E33]">
                {serviceStatus?.configured
                  ? `${serviceStatus.provider.toUpperCase()}${
                      serviceStatus.host ? ` (${serviceStatus.host})` : ''
                    }`
                  : 'None'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#64748B]">Sender Address</span>
              <span className="font-mono text-[#0F1E33] truncate">
                {serviceStatus?.fromAddress || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">WhatsApp Cloud API</span>
              <span className="font-semibold text-[#0F1E33]">
                {serviceStatus?.whatsappConfigured
                  ? 'API Live'
                  : 'Pre-filled wa.me links'}
              </span>
            </div>
          </div>

          {!serviceStatus?.configured && (
            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-[#0F1E33] space-y-1">
              <p className="font-bold">Environment Secrets Required for Email:</p>
              <p>
                Set <code className="font-mono font-bold">RESEND_API_KEY</code> (+ optional{' '}
                <code className="font-mono font-bold">RESEND_FROM</code>) or{' '}
                <code className="font-mono font-bold">SMTP_USER</code> /{' '}
                <code className="font-mono font-bold">SMTP_PASS</code> on the server.
              </p>
            </div>
          )}

          <form onSubmit={handleSendTest} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#0F1E33] mb-1">
                Send Verification Test Email To
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  className="input flex-1 text-xs"
                  placeholder="davidmagero22@gmail.com"
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
                    ? 'bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F1E33]'
                    : 'bg-red-50 border-red-200 text-red-700'
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
