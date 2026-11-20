import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  Gift,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { OrgDetailsSnapshot, SweepReport, useMasterAdmin } from '../../hooks/useMasterAdmin';
import { useAuthStore } from '../../store/authStore';
import { Tenant } from '../../types';
import { formatDate, formatUGX } from '../../utils/format';
import { getPlanQuota, PLAN_QUOTAS } from '../../utils/planLimits';
import { addCalendarMonths, computeTrialState } from '../../utils/trialUtils';
import { formatUgPhoneForWhatsApp } from '../../utils/whatsapp';
import {
  EmailServiceStatus,
  getNotificationServiceStatus,
  sendTestEmail,
} from '../../services/notificationService';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

type OrgFilterTab =
  | 'all'
  | 'pending'
  | 'active_paid'
  | 'trial'
  | 'complimentary'
  | 'expiring'
  | 'suspended';

export default function MasterDashboard() {
  const { user, isMasterAdmin } = useAuthStore();
  const {
    organizations,
    isLoading,
    isActing,
    approveSubscription,
    rejectSubscription,
    grantComplimentaryAccess,
    toggleDisableOrganization,
    updateOrgSubscription,
    sendSubscriptionReminder,
    runSubscriptionSweep,
    inspectOrganizationDetails,
  } = useMasterAdmin();

  const [filterTab, setFilterTab] = useState<OrgFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceStatus, setServiceStatus] = useState<EmailServiceStatus | null>(null);
  const [lastSweep, setLastSweep] = useState<SweepReport | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState(user?.email || '');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refreshEmailStatus = React.useCallback(() => {
    if (!isMasterAdmin) return;
    getNotificationServiceStatus()
      .then((res) => setServiceStatus(res))
      .catch(() => {});
  }, [isMasterAdmin]);

  React.useEffect(() => {
    refreshEmailStatus();
  }, [refreshEmailStatus]);

  React.useEffect(() => {
    if (user?.email && !testEmailTo) {
      setTestEmailTo(user.email);
    }
  }, [user?.email, testEmailTo]);

  // Approval modal
  const [approveTarget, setApproveTarget] = useState<Tenant | null>(null);
  const [approvePlan, setApprovePlan] = useState<Tenant['plan']>('business');
  const [approveMonths, setApproveMonths] = useState<number>(1);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Reminder modal
  const [remindTarget, setRemindTarget] = useState<Tenant | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderChannel, setReminderChannel] = useState<'in_app' | 'email' | 'whatsapp' | 'all'>('all');

  // Manage Org / Free Usage / Disable Drawer
  const [manageTarget, setManageTarget] = useState<Tenant | null>(null);
  const [orgDetails, setOrgDetails] = useState<OrgDetailsSnapshot | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [freePlan, setFreePlan] = useState<Tenant['plan']>('enterprise');
  const [freeDurationDays, setFreeDurationDays] = useState<string>('365');
  const [freeNote, setFreeNote] = useState('Complimentary free access granted by Novic Technologies');
  const [disableReason, setDisableReason] = useState('');
  const [editPlan, setEditPlan] = useState<Tenant['plan']>('micro');
  const [editSubscribedDate, setEditSubscribedDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editCustomPrice, setEditCustomPrice] = useState('');
  const [editAutoRemind, setEditAutoRemind] = useState(true);

  const liveApproveTarget = useMemo(
    () => (approveTarget ? organizations.find((o) => o.id === approveTarget.id) || approveTarget : null),
    [approveTarget, organizations]
  );
  const liveRemindTarget = useMemo(
    () => (remindTarget ? organizations.find((o) => o.id === remindTarget.id) || remindTarget : null),
    [remindTarget, organizations]
  );
  const liveManageTarget = useMemo(
    () => (manageTarget ? organizations.find((o) => o.id === manageTarget.id) || manageTarget : null),
    [manageTarget, organizations]
  );

  const metrics = useMemo(() => {
    const now = Date.now();
    let activePaid = 0;
    let trialActive = 0;
    let pendingApprovals = 0;
    let complimentary = 0;
    let suspendedOrExpired = 0;
    let expiringSoon = 0;
    let monthlyMrrUgx = 0;

    organizations.forEach((org) => {
      const state = computeTrialState(org, now);
      const hasPending = Boolean(org.pendingPlan || org.status === 'pending_approval');
      if (hasPending) pendingApprovals += 1;

      if (state.isComplimentary) {
        complimentary += 1;
      } else if (state.isActive) {
        activePaid += 1;
        const rate =
          typeof org.customPriceUgx === 'number'
            ? org.customPriceUgx
            : getPlanQuota(org.plan).monthlyPriceUgx;
        monthlyMrrUgx += rate;
      } else if (state.isTrial && !state.isExpired) {
        trialActive += 1;
      } else {
        suspendedOrExpired += 1;
      }

      if (!state.isExpired && state.effectiveEndsAt && state.daysRemaining <= 7) {
        expiringSoon += 1;
      }
    });

    return {
      total: organizations.length,
      activePaid,
      trialActive,
      pendingApprovals,
      complimentary,
      suspendedOrExpired,
      expiringSoon,
      monthlyMrrUgx,
    };
  }, [organizations]);

  const filteredOrgs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();

    return organizations.filter((org) => {
      const state = computeTrialState(org, now);
      const hasPending = Boolean(org.pendingPlan || org.status === 'pending_approval');

      if (filterTab === 'pending' && !hasPending) return false;
      if (filterTab === 'active_paid' && !(state.isActive && !state.isComplimentary)) return false;
      if (filterTab === 'trial' && !(state.isTrial && !state.isExpired)) return false;
      if (filterTab === 'complimentary' && !state.isComplimentary) return false;
      if (
        filterTab === 'expiring' &&
        !(!state.isExpired && state.effectiveEndsAt && state.daysRemaining <= 7)
      ) {
        return false;
      }
      if (filterTab === 'suspended' && !(state.isSuspended || state.isExpired)) return false;

      if (!q) return true;
      return (
        org.name.toLowerCase().includes(q) ||
        (org.ownerEmail || '').toLowerCase().includes(q) ||
        (org.ownerName || '').toLowerCase().includes(q) ||
        (org.pendingPaymentRef || '').toLowerCase().includes(q) ||
        org.id.toLowerCase().includes(q)
      );
    });
  }, [organizations, filterTab, searchQuery]);

  if (!isMasterAdmin) {
    return (
      <div className="card max-w-xl mx-auto p-8 text-center space-y-3">
        <ShieldAlert size={36} className="text-danger mx-auto" />
        <h1 className="text-xl font-bold text-primary">Master Account Required</h1>
        <p className="text-sm text-text-muted">
          Only verified platform Master Administrators can access multi-organization governance.
        </p>
      </div>
    );
  }

  const getMonthlyFee = (org: Tenant): number => {
    if (org.isComplimentary) return 0;
    if (typeof org.customPriceUgx === 'number') return org.customPriceUgx;
    return getPlanQuota(org.plan).monthlyPriceUgx;
  };

  const openApproveModal = (org: Tenant) => {
    setApproveTarget(org);
    setApprovePlan(org.pendingPlan || org.plan);
    setApproveMonths(1);
    setRejectMode(false);
    setRejectReason('');
  };

  const openRemindModal = (org: Tenant) => {
    const state = computeTrialState(org);
    const fee = getMonthlyFee(org);
    const expiryLabel = state.effectiveEndsAt
      ? formatDate(state.effectiveEndsAt.toISOString())
      : 'soon';
    const planName = getPlanQuota(org.plan).name;
    const defaultMsg = state.isExpired
      ? `Hello ${org.name}, your ${planName} subscription (${formatUGX(fee)}/mo) expired on ${expiryLabel}. Please complete payment in Billing to restore full POS & Inventory access.`
      : `Hello ${org.name}, friendly reminder that your ${planName} plan (${formatUGX(fee)}/mo) expires on ${expiryLabel} (${state.daysRemaining} day${state.daysRemaining === 1 ? '' : 's'} left). Renew early via MTN MoMo or Airtel Money in Billing.`;

    setRemindTarget(org);
    setReminderChannel('all');
    setReminderMessage(defaultMsg);
  };

  const openManageDrawer = async (org: Tenant) => {
    setManageTarget(org);
    setOrgDetails(null);
    setLoadingDetails(true);
    setFreePlan(org.plan === 'micro' ? 'enterprise' : org.plan);
    setFreeDurationDays('365');
    setFreeNote(org.complimentaryNote || 'Complimentary free access granted by Novic Technologies');
    setDisableReason(org.disabledReason || '');
    setEditPlan(org.plan);
    setEditSubscribedDate(org.subscribedAt ? org.subscribedAt.slice(0, 10) : '');
    setEditExpiryDate(org.subscriptionEndsAt ? org.subscriptionEndsAt.slice(0, 10) : '');
    setEditCustomPrice(typeof org.customPriceUgx === 'number' ? String(org.customPriceUgx) : '');
    setEditAutoRemind(org.autoRemindersEnabled !== false);

    try {
      const details = await inspectOrganizationDetails(org.id);
      setOrgDetails(details);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load organization branches & invoices');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveApproveTarget) return;
    if (rejectMode) {
      const ok = await rejectSubscription(liveApproveTarget, rejectReason);
      if (ok) setApproveTarget(null);
    } else {
      const ok = await approveSubscription(liveApproveTarget, {
        plan: approvePlan,
        months: approveMonths,
      });
      if (ok) setApproveTarget(null);
    }
  };

  const handleDispatchReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveRemindTarget) return;
    const res = await sendSubscriptionReminder(liveRemindTarget, {
      message: reminderMessage,
      channel: reminderChannel,
    });
    if (res.ok) {
      setRemindTarget(null);
    }
  };

  const handleRunSweep = async () => {
    const report = await runSubscriptionSweep();
    setLastSweep(report);
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await sendTestEmail(testEmailTo.trim() || undefined);
      refreshEmailStatus();
      if (res.sent) {
        const msg = `Test email sent via ${res.provider?.toUpperCase()} (${res.host || 'mail server'})!`;
        setTestEmailResult({ ok: true, message: msg });
        toast.success(msg);
      } else {
        const msg = res.error || 'Email service not configured yet.';
        setTestEmailResult({ ok: false, message: msg });
        toast.error(msg);
      }
    } finally {
      setIsTestingEmail(false);
    }
  };

  const renderStatusLabel = (org: Tenant) => {
    const state = computeTrialState(org);
    if (org.pendingPlan || org.status === 'pending_approval') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-alt whitespace-nowrap">
          <Clock size={14} />
          Pending Approval
        </span>
      );
    }
    if (state.isComplimentary) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent whitespace-nowrap">
          <Gift size={14} />
          Complimentary Free
        </span>
      );
    }
    if (state.isSuspended) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger whitespace-nowrap">
          <Lock size={14} />
          Disabled
        </span>
      );
    }
    if (state.isExpired) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger whitespace-nowrap">
          <XCircle size={14} />
          Expired
        </span>
      );
    }
    if (state.isTrial) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary whitespace-nowrap">
          <Clock size={14} className="text-accent" />
          14-Day Trial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent whitespace-nowrap">
        <CheckCircle2 size={14} />
        Active Paid
      </span>
    );
  };

  const tabs: Array<{ id: OrgFilterTab; label: string; count: number }> = [
    { id: 'all', label: 'All Orgs', count: metrics.total },
    { id: 'pending', label: 'Pending Approval', count: metrics.pendingApprovals },
    { id: 'active_paid', label: 'Active Paid', count: metrics.activePaid },
    { id: 'trial', label: 'Trial', count: metrics.trialActive },
    { id: 'complimentary', label: 'Free Access', count: metrics.complimentary },
    { id: 'expiring', label: 'Expiring ≤7d', count: metrics.expiringSoon },
    { id: 'suspended', label: 'Disabled / Expired', count: metrics.suspendedOrExpired },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Master Account Console</h1>
          <p className="text-text-muted text-sm mt-1">
            Monitor all organizations, enforce monthly billing cycles, approve subscriptions, grant free access, and dispatch automatic reminders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              refreshEmailStatus();
              setTestEmailResult(null);
              setIsEmailModalOpen(true);
            }}
            className="flex items-center gap-2 text-xs font-semibold text-primary bg-white border border-border hover:border-accent rounded-lg px-3 py-2 min-h-[38px] whitespace-nowrap transition-colors"
          >
            <Mail size={14} className={serviceStatus?.configured ? 'text-accent' : 'text-accent-alt'} />
            <span>
              Email:{' '}
              {serviceStatus?.configured
                ? `${serviceStatus.provider.toUpperCase()} · Test`
                : 'Configure & Test'}
            </span>
          </button>
          <button
            type="button"
            disabled={isActing || organizations.length === 0}
            onClick={handleRunSweep}
            className="btn btn-primary py-2 px-3.5 text-xs min-h-[38px] gap-1.5 whitespace-nowrap"
          >
            <RefreshCw size={14} className={isActing ? 'animate-spin' : ''} />
            Run Expiry &amp; Reminder Sweep
          </button>
        </div>
      </div>

      {lastSweep && lastSweep.whatsappLinks.length > 0 && (
        <div className="card p-4 border-accent/30 bg-accent/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-primary space-y-1">
            <p className="font-bold">
              Sweep Complete: {lastSweep.lockedCount} locked · {lastSweep.remindedCount} reminded ·{' '}
              {lastSweep.emailedCount} emails sent
            </p>
            <p className="text-text-secondary">
              Send WhatsApp follow-ups for organizations without Cloud API delivery:
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastSweep.whatsappLinks.slice(0, 4).map((item) => (
              <a
                key={item.tenantName}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary text-xs py-1.5 px-3 min-h-[34px] gap-1 whitespace-nowrap"
              >
                <MessageSquare size={13} className="text-accent" />
                {item.tenantName}
              </a>
            ))}
            <button
              type="button"
              onClick={() => setLastSweep(null)}
              className="p-1.5 text-text-muted hover:text-primary rounded"
              aria-label="Dismiss sweep notice"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-xs font-semibold text-text-muted">Total Organizations</p>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-1">{metrics.total}</p>
          <p className="text-xs text-text-secondary mt-1.5">
            {metrics.activePaid} paid · {metrics.trialActive} trial · {metrics.complimentary} free
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold text-text-muted">Pending Subscription Approvals</p>
          <p
            className={cn(
              'text-2xl font-bold font-mono tabular-nums mt-1',
              metrics.pendingApprovals > 0 ? 'text-accent-alt' : 'text-primary'
            )}
          >
            {metrics.pendingApprovals}
          </p>
          <p className="text-xs text-text-secondary mt-1.5">
            {metrics.pendingApprovals > 0
              ? 'Awaiting manual verification to unlock'
              : 'All submitted payments reviewed'}
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold text-text-muted">Active Monthly Revenue</p>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-1">
            {formatUGX(metrics.monthlyMrrUgx)}
          </p>
          <p className="text-xs text-text-secondary mt-1.5">Excludes trial & complimentary workspaces</p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold text-text-muted">Expiring &amp; Disabled</p>
          <p className="text-2xl font-bold text-danger font-mono tabular-nums mt-1">
            {metrics.expiringSoon + metrics.suspendedOrExpired}
          </p>
          <p className="text-xs text-text-secondary mt-1.5">
            {metrics.expiringSoon} expiring within 7 days · {metrics.suspendedOrExpired} locked
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-surface-alt rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
                  filterTab === tab.id
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-secondary hover:text-primary'
                )}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search org, owner email, ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 min-h-[40px] py-2 text-sm"
            />
          </div>
        </div>

        {/* Organizations Table */}
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-text-muted mt-3">Loading organizations...</p>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">
            No organizations match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-alt/70 border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Plan &amp; Fee</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expiry</th>
                  <th className="py-3 px-4">Pending Submission</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredOrgs.map((org) => {
                  const state = computeTrialState(org);
                  const quota = getPlanQuota(org.plan);
                  const fee = getMonthlyFee(org);
                  const hasPending = Boolean(org.pendingPlan || org.status === 'pending_approval');

                  return (
                    <tr key={org.id} className="hover:bg-surface-alt/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          {org.logo ? (
                            <img
                              src={org.logo}
                              alt={org.name}
                              className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                              style={{ backgroundColor: org.branding?.primaryColor || '#0A2540' }}
                            >
                              {org.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-primary truncate">{org.name}</p>
                            <p className="text-xs text-text-muted truncate">
                              {org.ownerEmail || org.ownerName || org.id.slice(0, 12)}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-semibold text-primary">{quota.name}</p>
                        <p className="text-xs font-mono tabular-nums text-text-secondary">
                          {org.isComplimentary ? 'UGX 0 (Free)' : `${formatUGX(fee)}/mo`}
                        </p>
                      </td>

                      <td className="py-3 px-4">{renderStatusLabel(org)}</td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {state.isComplimentary && !state.subscriptionEndsAt ? (
                          <span className="text-xs font-semibold text-accent">No Expiry</span>
                        ) : state.effectiveEndsAt ? (
                          <div>
                            <p className="text-xs font-mono tabular-nums text-primary">
                              {formatDate(state.effectiveEndsAt.toISOString())}
                            </p>
                            <p
                              className={cn(
                                'text-[11px] font-semibold tabular-nums',
                                state.isExpired
                                  ? 'text-danger'
                                  : state.daysRemaining <= 7
                                  ? 'text-accent-alt'
                                  : 'text-text-muted'
                              )}
                            >
                              {state.isExpired
                                ? 'Elapsed'
                                : `${state.daysRemaining}d remaining`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {hasPending ? (
                          <div className="text-xs min-w-[160px]">
                            <p className="font-bold text-primary">
                              {(org.pendingPlan || org.plan).toUpperCase()} ·{' '}
                              <span className="font-mono tabular-nums">
                                {formatUGX(org.pendingAmountUgx || getPlanQuota(org.pendingPlan || org.plan).monthlyPriceUgx)}
                              </span>
                            </p>
                            <p className="text-text-muted font-mono truncate">
                              {org.pendingPaymentRef || 'No ref'} ({org.pendingPaymentMethod || 'Manual'})
                            </p>
                          </div>
                        ) : org.lastReminderAt ? (
                          <span className="text-[11px] text-text-muted">
                            Reminded {formatDate(org.lastReminderAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {hasPending && (
                            <button
                              type="button"
                              onClick={() => openApproveModal(org)}
                              className="btn btn-primary py-1.5 px-3 text-xs min-h-[34px] gap-1 whitespace-nowrap"
                            >
                              <CheckCircle2 size={14} />
                              Review
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openRemindModal(org)}
                            className="btn btn-secondary py-1.5 px-3 text-xs min-h-[34px] gap-1 whitespace-nowrap"
                          >
                            <Send size={13} />
                            Send Reminder
                          </button>

                          <button
                            type="button"
                            onClick={() => openManageDrawer(org)}
                            className="btn btn-secondary py-1.5 px-3 text-xs min-h-[34px] gap-1 whitespace-nowrap"
                          >
                            <SlidersHorizontal size={13} />
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subscription Approval / Rejection Modal */}
      {liveApproveTarget && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <div>
                <h3 className="text-lg font-bold text-white">Approve Subscription</h3>
                <p className="text-xs text-white/75">{liveApproveTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmApproval} className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Submitted Plan</span>
                  <strong className="text-primary">{(liveApproveTarget.pendingPlan || liveApproveTarget.plan).toUpperCase()}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Amount</span>
                  <strong className="font-mono tabular-nums text-primary">
                    {formatUGX(
                      liveApproveTarget.pendingAmountUgx ||
                        getPlanQuota(liveApproveTarget.pendingPlan || liveApproveTarget.plan).monthlyPriceUgx
                    )}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Channel</span>
                  <span className="text-primary font-medium">{liveApproveTarget.pendingPaymentMethod || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Payment Ref</span>
                  <span className="font-mono text-primary font-bold">{liveApproveTarget.pendingPaymentRef || '—'}</span>
                </div>
                {liveApproveTarget.pendingPayerPhone && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Payer Phone</span>
                    <span className="font-mono text-primary">{liveApproveTarget.pendingPayerPhone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 bg-surface-alt rounded-lg">
                <button
                  type="button"
                  onClick={() => setRejectMode(false)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-bold rounded-md transition-colors',
                    !rejectMode ? 'bg-white text-primary shadow-sm' : 'text-text-secondary'
                  )}
                >
                  Approve &amp; Activate
                </button>
                <button
                  type="button"
                  onClick={() => setRejectMode(true)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-bold rounded-md transition-colors',
                    rejectMode ? 'bg-white text-danger shadow-sm' : 'text-text-secondary'
                  )}
                >
                  Decline Payment
                </button>
              </div>

              {!rejectMode ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Plan to Activate</label>
                    <select
                      className="input w-full"
                      value={approvePlan}
                      onChange={(e) => setApprovePlan(e.target.value as Tenant['plan'])}
                    >
                      {Object.values(PLAN_QUOTAS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatUGX(p.monthlyPriceUgx)}/mo
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">
                      Billing Cycle Duration (Calendar Months from Today)
                    </label>
                    <select
                      className="input w-full"
                      value={approveMonths}
                      onChange={(e) => setApproveMonths(Number(e.target.value))}
                    >
                      <option value={1}>1 Calendar Month (Monthly Cycle)</option>
                      <option value={3}>3 Months (Quarterly)</option>
                      <option value={6}>6 Months (Biannual)</option>
                      <option value={12}>12 Months (Annual)</option>
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">Reason for Declining *</label>
                  <textarea
                    required
                    rows={3}
                    className="input w-full min-h-[88px]"
                    placeholder="e.g. Transaction reference MP250411 not received on merchant till."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setApproveTarget(null)}
                  className="btn btn-secondary flex-1 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActing}
                  className={cn(
                    'btn flex-1 whitespace-nowrap',
                    rejectMode ? 'bg-danger text-white hover:bg-danger/90' : 'btn-primary'
                  )}
                >
                  {isActing ? 'Updating...' : rejectMode ? 'Confirm Decline' : 'Approve & Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Reminder Modal */}
      {liveRemindTarget && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <div>
                <h3 className="text-lg font-bold text-white">Send Subscription Reminder</h3>
                <p className="text-xs text-white/75">
                  {liveRemindTarget.name} · {liveRemindTarget.ownerEmail || 'In-app alert'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRemindTarget(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg"
                aria-label="Close reminder modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDispatchReminder} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">Delivery Channels</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'all', label: 'All Channels' },
                    { id: 'in_app', label: 'In-App Only' },
                    { id: 'email', label: 'Email + App' },
                    { id: 'whatsapp', label: 'WhatsApp' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setReminderChannel(opt.id as 'in_app' | 'email' | 'whatsapp' | 'all')
                      }
                      className={cn(
                        'py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap',
                        reminderChannel === opt.id
                          ? 'border-accent bg-accent/10 text-primary'
                          : 'border-border text-text-secondary hover:bg-surface-alt'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-primary mb-1">Reminder Message *</label>
                <textarea
                  required
                  rows={4}
                  maxLength={500}
                  className="input w-full min-h-[100px] text-sm"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {liveRemindTarget.ownerEmail && (
                  <a
                    href={`mailto:${encodeURIComponent(liveRemindTarget.ownerEmail)}?subject=${encodeURIComponent(
                      `Subscription Reminder — ${liveRemindTarget.name}`
                    )}&body=${encodeURIComponent(reminderMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary text-xs py-2 px-3 min-h-[38px] gap-1.5 whitespace-nowrap"
                  >
                    <Mail size={14} />
                    Open Email Client
                  </a>
                )}
                <a
                  href={`https://wa.me/${formatUgPhoneForWhatsApp(
                    liveRemindTarget.ownerPhone || liveRemindTarget.pendingPayerPhone
                  )}?text=${encodeURIComponent(reminderMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-2 px-3 min-h-[38px] gap-1.5 whitespace-nowrap"
                >
                  <MessageSquare size={14} />
                  Open WhatsApp
                </a>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRemindTarget(null)}
                  className="btn btn-secondary flex-1 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isActing} className="btn btn-primary flex-1 gap-1.5 whitespace-nowrap">
                  <Send size={15} />
                  {isActing ? 'Sending...' : 'Deliver Live Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Organization Drawer/Modal (Free Usage, Plan/Expiry Edit, Disable, Branches & Team) */}
      {liveManageTarget && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">{liveManageTarget.name}</h3>
                <p className="text-xs text-white/75">
                  {liveManageTarget.ownerEmail || 'Owner email unavailable'} · Created {formatDate(liveManageTarget.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageTarget(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg"
                aria-label="Close manage modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Branches & Staff Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-surface-alt/60 border border-border">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary mb-2">
                    <Building2 size={15} className="text-accent" />
                    <span>Branches ({loadingDetails ? '...' : orgDetails?.branches.length || 0})</span>
                  </div>
                  {loadingDetails ? (
                    <p className="text-xs text-text-muted">Loading branches...</p>
                  ) : orgDetails?.branches.length ? (
                    <ul className="space-y-1 text-xs text-text-secondary">
                      {orgDetails.branches.map((b) => (
                        <li key={b.id} className="flex justify-between">
                          <span className="truncate font-medium text-primary">{b.name}</span>
                          <span className="text-text-muted">{b.location}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted">No branches recorded.</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-surface-alt/60 border border-border">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary mb-2">
                    <Users size={15} className="text-accent" />
                    <span>Team Users ({loadingDetails ? '...' : orgDetails?.members.length || 0})</span>
                  </div>
                  {loadingDetails ? (
                    <p className="text-xs text-text-muted">Loading staff...</p>
                  ) : orgDetails?.members.length ? (
                    <ul className="space-y-1 text-xs text-text-secondary">
                      {orgDetails.members.slice(0, 5).map((m) => (
                        <li key={m.uid} className="flex justify-between gap-2">
                          <span className="truncate font-medium text-primary">{m.name}</span>
                          <span className="capitalize text-text-muted">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted">No team members recorded.</p>
                  )}
                </div>
              </div>

              {/* Grant Free / Complimentary Access */}
              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gift size={18} className="text-accent" />
                    <h4 className="text-sm font-bold text-primary">Grant Free (Complimentary) Access</h4>
                  </div>
                  {liveManageTarget.isComplimentary && (
                    <span className="text-xs font-bold text-accent">Currently Free</span>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  Allow this business to use any subscription pack free of charge with zero monthly billing.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Complimentary Pack</label>
                    <select
                      className="input w-full"
                      value={freePlan}
                      onChange={(e) => setFreePlan(e.target.value as Tenant['plan'])}
                    >
                      {Object.values(PLAN_QUOTAS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Free Access Duration</label>
                    <select
                      className="input w-full"
                      value={freeDurationDays}
                      onChange={(e) => setFreeDurationDays(e.target.value)}
                    >
                      <option value="">Unlimited (No Expiry)</option>
                      <option value="30">30 Days Free</option>
                      <option value="90">90 Days Free</option>
                      <option value="365">1 Year Free</option>
                    </select>
                  </div>
                </div>
                <input
                  type="text"
                  className="input w-full text-xs"
                  placeholder="Reason / note (e.g. Partner store or CSR grant)"
                  value={freeNote}
                  onChange={(e) => setFreeNote(e.target.value)}
                />
                <button
                  type="button"
                  disabled={isActing}
                  onClick={async () => {
                    const ok = await grantComplimentaryAccess(liveManageTarget, {
                      plan: freePlan,
                      durationDays: freeDurationDays ? Number(freeDurationDays) : null,
                      note: freeNote,
                    });
                    if (ok) setManageTarget(null);
                  }}
                  className="btn btn-primary text-xs py-2 px-4 min-h-[38px] gap-1.5 whitespace-nowrap"
                >
                  <Gift size={14} />
                  {liveManageTarget.isComplimentary ? 'Update Complimentary Access' : 'Make Usage Free Now'}
                </button>
              </div>

              {/* Manual Plan, Subscribed Start & Expiry Adjustment */}
              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-primary">
                    Adjust Plan, Subscribed Date, Custom Fee &amp; Expiry
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const base = editSubscribedDate
                        ? new Date(`${editSubscribedDate}T00:00:00.000Z`)
                        : new Date();
                      const startStr = base.toISOString().slice(0, 10);
                      const endStr = addCalendarMonths(base, 1).toISOString().slice(0, 10);
                      setEditSubscribedDate(startStr);
                      setEditExpiryDate(endStr);
                    }}
                    className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                  >
                    +1 Month from Subscribed
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Plan Tier</label>
                    <select
                      className="input w-full"
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value as Tenant['plan'])}
                    >
                      {Object.values(PLAN_QUOTAS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Subscribed Date</label>
                    <input
                      type="date"
                      className="input w-full font-mono"
                      value={editSubscribedDate}
                      onChange={(e) => setEditSubscribedDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Expiry Date</label>
                    <input
                      type="date"
                      className="input w-full font-mono"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">Custom Fee (UGX)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Default fee"
                      className="input w-full font-mono tabular-nums"
                      value={editCustomPrice}
                      onChange={(e) => setEditCustomPrice(e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAutoRemind}
                    onChange={(e) => setEditAutoRemind(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  Automatically send In-App, Email &amp; WhatsApp renewal reminders when due
                </label>
                <button
                  type="button"
                  disabled={isActing}
                  onClick={async () => {
                    const ok = await updateOrgSubscription(liveManageTarget, {
                      plan: editPlan,
                      subscribedAt: editSubscribedDate
                        ? new Date(`${editSubscribedDate}T00:00:00.000Z`).toISOString()
                        : undefined,
                      subscriptionEndsAt: editExpiryDate
                        ? new Date(`${editExpiryDate}T23:59:59.000Z`).toISOString()
                        : undefined,
                      customPriceUgx: editCustomPrice.trim() ? Number(editCustomPrice) : null,
                      isComplimentary: editCustomPrice.trim() === '0',
                      autoRemindersEnabled: editAutoRemind,
                    });
                    if (ok) setManageTarget(null);
                  }}
                  className="btn btn-secondary text-xs py-2 px-4 min-h-[38px] whitespace-nowrap"
                >
                  Save Subscription Changes
                </button>
              </div>

              {/* Disable / Re-Enable Business */}
              <div className="p-4 rounded-xl border border-danger/25 bg-danger/5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-primary">
                      {liveManageTarget.status === 'suspended'
                        ? 'Re-Enable Business Workspace'
                        : 'Disable / Suspend Business'}
                    </h4>
                    <p className="text-xs text-text-secondary">
                      {liveManageTarget.status === 'suspended'
                        ? 'Restore operational access to POS, Inventory, and Reports for this business.'
                        : 'Immediately locks POS, Inventory, and operational writes across all branches.'}
                    </p>
                  </div>
                </div>

                {liveManageTarget.status !== 'suspended' && (
                  <input
                    type="text"
                    className="input w-full bg-white text-xs"
                    placeholder="Optional reason shown to the business (e.g. Overdue invoice)"
                    value={disableReason}
                    onChange={(e) => setDisableReason(e.target.value)}
                  />
                )}

                <button
                  type="button"
                  disabled={isActing}
                  onClick={async () => {
                    const shouldDisable = liveManageTarget.status !== 'suspended';
                    const ok = await toggleDisableOrganization(
                      liveManageTarget,
                      shouldDisable,
                      disableReason
                    );
                    if (ok) setManageTarget(null);
                  }}
                  className={cn(
                    'btn text-xs py-2 px-4 min-h-[38px] gap-1.5 whitespace-nowrap',
                    liveManageTarget.status === 'suspended'
                      ? 'btn-primary'
                      : 'bg-danger text-white hover:bg-danger/90'
                  )}
                >
                  {liveManageTarget.status === 'suspended' ? <Unlock size={14} /> : <Lock size={14} />}
                  {liveManageTarget.status === 'suspended'
                    ? 'Re-Enable Organization'
                    : 'Disable Organization'}
                </button>
              </div>

              {/* Billing History Preview */}
              {orgDetails && orgDetails.billingHistory.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Recent Invoices ({orgDetails.billingHistory.length})
                  </h4>
                  <div className="border border-border rounded-xl divide-y divide-border">
                    {orgDetails.billingHistory.slice(0, 6).map((inv) => (
                      <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-mono font-semibold text-primary">{inv.reference}</p>
                          <p className="text-text-muted">
                            {formatDate(inv.createdAt)} · {inv.plan?.toUpperCase()} · {inv.paymentMethod}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono tabular-nums font-bold text-primary">
                            {formatUGX(inv.amount)}
                          </p>
                          <p
                            className={cn(
                              'font-semibold',
                              inv.status === 'Paid' || inv.status === 'Complimentary'
                                ? 'text-accent'
                                : inv.status === 'Rejected'
                                ? 'text-danger'
                                : 'text-accent-alt'
                            )}
                          >
                            {inv.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email Service Configuration & Live Verification Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <div>
                <h3 className="text-lg font-bold text-white">Email Delivery Configuration</h3>
                <p className="text-xs text-white/75">
                  Verify transactional email &amp; automatic reminder transport
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg"
                aria-label="Close email configuration modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Transport Status</span>
                  <strong className={serviceStatus?.configured ? 'text-accent' : 'text-danger'}>
                    {serviceStatus?.configured ? 'Configured & Ready' : 'Not Configured'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Active Provider</span>
                  <span className="font-mono font-bold text-primary">
                    {serviceStatus?.configured
                      ? `${serviceStatus.provider.toUpperCase()}${serviceStatus.host ? ` (${serviceStatus.host})` : ''}`
                      : 'None'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary shrink-0">Sender Address</span>
                  <span className="font-mono text-primary truncate">
                    {serviceStatus?.fromAddress || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">WhatsApp Cloud API</span>
                  <span className="font-semibold text-primary">
                    {serviceStatus?.whatsappConfigured ? 'API Live' : 'Pre-filled wa.me links'}
                  </span>
                </div>
              </div>

              {!serviceStatus?.configured && (
                <div className="p-3.5 rounded-xl border border-accent-alt/30 bg-accent-alt/10 text-xs text-primary space-y-1.5">
                  <p className="font-bold">How to activate automatic emails in Settings &gt; Secrets:</p>
                  <p>
                    <strong>Option A — Resend (Recommended):</strong> Add{' '}
                    <code className="font-mono font-bold">RESEND_API_KEY</code> and optional{' '}
                    <code className="font-mono font-bold">RESEND_FROM</code>.
                  </p>
                  <p>
                    <strong>Option B — Gmail / Google Workspace SMTP:</strong> Add{' '}
                    <code className="font-mono font-bold">SMTP_USER</code> (your Gmail address) and{' '}
                    <code className="font-mono font-bold">SMTP_PASS</code> (16-char Google App Password).
                  </p>
                </div>
              )}

              <form onSubmit={handleSendTestEmail} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">
                    Send Verification Test Email To
                  </label>
                  <input
                    type="email"
                    required
                    className="input w-full text-sm"
                    placeholder="davidmagero22@gmail.com"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                  />
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

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={refreshEmailStatus}
                    className="btn btn-secondary text-xs py-2 px-3 min-h-[38px] gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw size={13} />
                    Refresh Status
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEmailModalOpen(false)}
                      className="btn btn-secondary text-xs py-2 px-4 min-h-[38px]"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={isTestingEmail}
                      className="btn btn-primary text-xs py-2 px-4 min-h-[38px] gap-1.5 whitespace-nowrap"
                    >
                      <Send size={13} />
                      {isTestingEmail ? 'Testing...' : 'Send Test Email'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
