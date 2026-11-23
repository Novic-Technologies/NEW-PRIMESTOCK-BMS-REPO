import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import { OrgDetailsSnapshot, useMasterAdmin } from '../../hooks/useMasterAdmin';
import { Tenant } from '../../types';
import { getPlanQuota } from '../../utils/planLimits';
import {
  PLAN_ORDER,
  computeCycleBillingTotal,
  usePlatformPlansConfig,
} from '../../utils/platformPlans';
import { checkUgandaPaymentStatus } from '../../services/aiService';
import { formatDate, formatUGX } from '../../utils/format';
import { cn } from '../../lib/utils';
import { OrgInspectorModal } from './OrgInspectorModal';
import { KpiValueSkeleton, Skeleton } from '../../components/shared/Skeletons';
import toast from 'react-hot-toast';

export default function MasterApprovals() {
  const {
    organizations,
    isLoading,
    isActing,
    approveSubscription,
    rejectSubscription,
    toggleDisableOrganization,
    updateOrgSubscription,
    grantComplimentaryAccess,
    sendSubscriptionReminder,
    inspectOrganizationDetails,
    updateOrgMember,
    revokeOrgInvite,
    deleteOrganizationWorkspace,
  } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();

  const [reviewTarget, setReviewTarget] = useState<Tenant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Tenant['plan']>('starter');
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [customPrice, setCustomPrice] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyingGatewayId, setVerifyingGatewayId] = useState<string | null>(null);
  const [gatewayProbeMap, setGatewayProbeMap] = useState<
    Record<string, { status: string; amount: number; currency: string; verified: boolean }>
  >({});

  const [inspectedOrg, setInspectedOrg] = useState<Tenant | null>(null);
  const [snapshot, setSnapshot] = useState<OrgDetailsSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const pendingOrgs = useMemo(
    () =>
      organizations.filter((o) =>
        Boolean(o.pendingPlan || o.status === 'pending_approval')
      ),
    [organizations]
  );

  const liveReviewTarget = useMemo(
    () =>
      reviewTarget
        ? organizations.find((o) => o.id === reviewTarget.id) || reviewTarget
        : null,
    [reviewTarget, organizations]
  );

  const liveInspectedOrg = useMemo(
    () =>
      inspectedOrg
        ? organizations.find((o) => o.id === inspectedOrg.id) || inspectedOrg
        : null,
    [inspectedOrg, organizations]
  );

  const metrics = useMemo(() => {
    const pendingValueUgx = pendingOrgs.reduce((sum, org) => {
      const requested = org.pendingPlan || org.plan;
      return (
        sum +
        (org.pendingAmountUgx || getPlanQuota(requested).monthlyPriceUgx)
      );
    }, 0);
    const activePaidCount = organizations.filter(
      (o) => o.status === 'active' && !o.locked && !o.isComplimentary
    ).length;

    return { pendingValueUgx, activePaidCount };
  }, [pendingOrgs, organizations, plansConfig]);

  const openReviewModal = (org: Tenant) => {
    setReviewTarget(org);
    setSelectedPlan(org.pendingPlan || org.plan);
    setMonths(1);
    setCustomPrice(
      typeof org.customPriceUgx === 'number' ? String(org.customPriceUgx) : ''
    );
    setRejectMode(false);
    setRejectReason('');
  };

  const openInspector = async (org: Tenant) => {
    setInspectedOrg(org);
    setLoadingSnapshot(true);
    try {
      const snap = await inspectOrganizationDetails(org.id);
      setSnapshot(snap);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const handleVerifyGateway = async (org: Tenant) => {
    if (!org.pendingTransactionId) {
      toast.error('No Flutterwave Transaction ID attached to this submission.');
      return;
    }
    setVerifyingGatewayId(org.id);
    try {
      const res = await checkUgandaPaymentStatus(org.pendingTransactionId);
      setGatewayProbeMap((prev) => ({
        ...prev,
        [org.id]: {
          status: res.status,
          amount: res.amount,
          currency: res.currency,
          verified: Boolean(res.gatewayVerified || res.status === 'successful'),
        },
      }));
      if (res.gatewayVerified || res.status === 'successful') {
        toast.success(
          `Gateway verified: ${res.currency} ${res.amount.toLocaleString()} (${res.status})`
        );
      } else {
        toast(`Gateway status: ${res.status}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Unable to query payment gateway'
      );
    } finally {
      setVerifyingGatewayId(null);
    }
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveReviewTarget) return;

    if (rejectMode) {
      if (!rejectReason.trim()) {
        toast.error('Enter a clear reason for declining this payment.');
        return;
      }
      const ok = await rejectSubscription(liveReviewTarget, rejectReason);
      if (ok) setReviewTarget(null);
      return;
    }

    const ok = await approveSubscription(liveReviewTarget, {
      plan: selectedPlan,
      months,
      customPriceUgx:
        customPrice.trim() !== '' ? Math.max(0, Number(customPrice) || 0) : undefined,
    });
    if (ok) setReviewTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E33] tracking-tight">
            Subscription Upgrade Approvals
          </h1>
          <p className="text-sm text-[#475569] mt-0.5">
            Verify submitted MTN MoMo, Airtel Money, Flutterwave, and Bank Transfer payments to activate or renew merchant plans.
          </p>
        </div>
        <Link
          to="/master/monitoring"
          className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap shrink-0"
        >
          View All Businesses
        </Link>
      </div>

      {/* Queue KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-[#64748B]">Pending Reviews</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
            {isLoading ? <KpiValueSkeleton className="w-12" /> : pendingOrgs.length}
          </p>
          <p className="text-xs text-[#64748B] mt-0.5">Submitted payment references</p>
        </div>
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-[#64748B]">Pending Volume (UGX)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#0F766E] mt-1">
            {isLoading ? <KpiValueSkeleton className="w-28" /> : formatUGX(metrics.pendingValueUgx)}
          </p>
          <p className="text-xs text-[#64748B] mt-0.5">Combined awaiting activation</p>
        </div>
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-[#64748B]">Active Paid Businesses</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.activePaidCount}
          </p>
          <p className="text-xs text-[#64748B] mt-0.5">Verified active subscriptions</p>
        </div>
      </div>

      {/* Queue List */}
      <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#D5DEE9] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0F1E33]">
            Submitted Upgrade &amp; Renewal Queue ({pendingOrgs.length})
          </h2>
          <Link
            to="/master/payments"
            className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
          >
            <CreditCard size={13} />
            Configure Channels
          </Link>
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#D5DEE9]">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : pendingOrgs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 size={32} className="text-[#0F766E] mx-auto" />
            <p className="text-sm font-bold text-[#0F1E33]">Approval queue is clear</p>
            <p className="text-xs text-[#64748B]">
              New MoMo, Airtel Money, Flutterwave, and EFT upgrade submissions appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#D5DEE9]">
            {pendingOrgs.map((org) => {
              const targetPlan = org.pendingPlan || org.plan;
              const quota = getPlanQuota(targetPlan);
              const amount = org.pendingAmountUgx || quota.monthlyPriceUgx;
              const probe = gatewayProbeMap[org.id];

              return (
                <div
                  key={org.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#F1F5F9]"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#0F1E33]">{org.name}</span>
                      <span className="text-xs font-semibold text-[#0F766E]">
                        {getPlanQuota(org.plan).name} → {quota.name}
                      </span>
                      <span className="font-mono tabular-nums text-xs font-bold text-[#0F1E33]">
                        {formatUGX(amount)}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569]">
                      Owner: {org.ownerEmail || org.ownerName || '—'}
                      {org.pendingPayerPhone ? ` · Payer: ${org.pendingPayerPhone}` : ''}
                    </p>
                    <p className="text-xs text-[#64748B] font-mono">
                      Method: {org.pendingPaymentMethod || 'Manual'} · Ref:{' '}
                      <strong className="text-[#0F1E33]">
                        {org.pendingPaymentRef || '—'}
                      </strong>
                      {org.pendingTransactionId
                        ? ` · Gateway Tx: ${org.pendingTransactionId}`
                        : ''}
                      {org.pendingSubmittedAt
                        ? ` · Submitted ${formatDate(org.pendingSubmittedAt)}`
                        : ''}
                    </p>
                    {probe && (
                      <p
                        className={cn(
                          'text-xs font-semibold inline-flex items-center gap-1',
                          probe.verified ? 'text-[#0F766E]' : 'text-amber-700'
                        )}
                      >
                        <ShieldCheck size={13} />
                        Flutterwave check: {probe.status} ({probe.currency}{' '}
                        {probe.amount.toLocaleString()})
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {org.pendingTransactionId && (
                      <button
                        type="button"
                        disabled={verifyingGatewayId === org.id}
                        onClick={() => handleVerifyGateway(org)}
                        className="btn btn-secondary text-xs py-2 px-3 min-h-[34px] gap-1.5 whitespace-nowrap"
                      >
                        <RefreshCw
                          size={13}
                          className={verifyingGatewayId === org.id ? 'animate-spin' : ''}
                        />
                        Check Gateway
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openInspector(org)}
                      className="btn btn-secondary text-xs py-2 px-3 min-h-[34px] gap-1.5 whitespace-nowrap"
                    >
                      <SlidersHorizontal size={13} />
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => openReviewModal(org)}
                      className="btn btn-primary text-xs py-2 px-4 min-h-[34px] gap-1.5 whitespace-nowrap"
                    >
                      <CheckCircle2 size={14} />
                      Review &amp; Decide
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review & Approve / Decline Modal */}
      {liveReviewTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#FBFDFF] rounded-xl border border-[#D5DEE9] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="px-5 py-4 bg-[#0B1F3A] text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold">Review Subscription Payment</h3>
                <p className="text-xs text-slate-300">{liveReviewTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDecision} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="p-3.5 rounded-lg bg-[#F1F5F9] border border-[#D5DEE9] text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Requested Plan</span>
                  <strong className="text-[#0F1E33]">
                    {getPlanQuota(liveReviewTarget.pendingPlan || liveReviewTarget.plan).name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Submitted Amount</span>
                  <strong className="font-mono tabular-nums text-[#0F1E33]">
                    {formatUGX(
                      liveReviewTarget.pendingAmountUgx ||
                        getPlanQuota(
                          liveReviewTarget.pendingPlan || liveReviewTarget.plan
                        ).monthlyPriceUgx
                    )}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Payment Method</span>
                  <span className="font-medium text-[#0F1E33]">
                    {liveReviewTarget.pendingPaymentMethod || 'Manual'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Reference</span>
                  <strong className="font-mono text-[#0F1E33]">
                    {liveReviewTarget.pendingPaymentRef || '—'}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#F1F5F9]">
                <button
                  type="button"
                  onClick={() => setRejectMode(false)}
                  className={cn(
                    'py-1.5 rounded-md text-xs font-bold transition-colors',
                    !rejectMode
                      ? 'bg-[#FBFDFF] text-[#0F1E33] shadow-xs'
                      : 'text-[#64748B]'
                  )}
                >
                  Approve &amp; Activate
                </button>
                <button
                  type="button"
                  onClick={() => setRejectMode(true)}
                  className={cn(
                    'py-1.5 rounded-md text-xs font-bold transition-colors',
                    rejectMode
                      ? 'bg-[#FBFDFF] text-red-600 shadow-xs'
                      : 'text-[#64748B]'
                  )}
                >
                  Decline Payment
                </button>
              </div>

              {!rejectMode ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#0F1E33] mb-1">
                      Plan to Activate
                    </label>
                    <select
                      className="input w-full text-xs"
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value as Tenant['plan'])}
                    >
                      {PLAN_ORDER.map((planId) => {
                        const q = plansConfig.tiers[planId];
                        return (
                          <option key={planId} value={planId}>
                            {q.name} ({formatUGX(q.monthlyPriceUgx)}/mo)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F1E33] mb-1">
                      Billing Cycle Duration
                    </label>
                    <select
                      className="input w-full text-xs"
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
                    >
                      {([1, 3, 6, 12] as const).map((m) => {
                        const calc = computeCycleBillingTotal(
                          plansConfig.tiers[selectedPlan].monthlyPriceUgx,
                          m,
                          plansConfig
                        );
                        return (
                          <option key={m} value={m}>
                            {m} {m === 1 ? 'Month' : 'Months'} — {formatUGX(calc.netUgx)}
                            {calc.discountPercent > 0 ? ` (${calc.discountPercent}% off)` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0F1E33] mb-1">
                      Custom Monthly Rate Override (Optional UGX)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input w-full text-xs font-mono"
                      placeholder="Leave blank for standard tier rate"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[#0F1E33] mb-1">
                    Reason for Declining *
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="input w-full text-xs"
                    placeholder="e.g. Reference MP250411 not found on merchant MoMo statement."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActing}
                  className={cn(
                    'btn flex-1 text-xs gap-1.5 whitespace-nowrap',
                    rejectMode
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'btn-primary'
                  )}
                >
                  {rejectMode ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                  {isActing
                    ? 'Processing...'
                    : rejectMode
                    ? 'Confirm Decline'
                    : 'Approve & Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <OrgInspectorModal
        org={liveInspectedOrg}
        snapshot={snapshot}
        isLoading={loadingSnapshot}
        isActing={isActing}
        onClose={() => {
          setInspectedOrg(null);
          setSnapshot(null);
        }}
        onRefresh={async (org) => {
          setLoadingSnapshot(true);
          try {
            setSnapshot(await inspectOrganizationDetails(org.id));
          } finally {
            setLoadingSnapshot(false);
          }
        }}
        onApprove={approveSubscription}
        onToggleDisable={toggleDisableOrganization}
        onUpdateSubscription={updateOrgSubscription}
        onGrantComplimentary={grantComplimentaryAccess}
        onSendReminder={sendSubscriptionReminder}
        onUpdateMember={updateOrgMember}
        onRevokeInvite={revokeOrgInvite}
        onDeleteWorkspace={deleteOrganizationWorkspace}
      />
    </div>
  );
}
