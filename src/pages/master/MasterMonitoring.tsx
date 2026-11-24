import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Lock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Unlock,
  Sparkles,
  MessageSquareText,
  X,
} from 'lucide-react';
import {
  OrgDetailsSnapshot,
  OrgUsageMetric,
  useMasterAdmin,
} from '../../hooks/useMasterAdmin';
import { Tenant } from '../../types';
import { getPlanQuota } from '../../utils/planLimits';
import {
  PLAN_ORDER,
  formatLimitDisplay,
  usePlatformPlansConfig,
} from '../../utils/platformPlans';
import { computeTrialState } from '../../utils/trialUtils';
import { computeMasterWorkspaceInsights } from '../../utils/aiAnalytics';
import { MasterTriageResult, runAiAssistantTool } from '../../services/aiService';
import { formatDate, formatUGX } from '../../utils/format';
import { cn } from '../../lib/utils';
import { OrgInspectorModal } from './OrgInspectorModal';
import { MobileListSkeleton, Skeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import toast from 'react-hot-toast';

type MonitoringFilter =
  | 'all'
  | 'active'
  | 'trial'
  | 'pending'
  | 'locked'
  | 'quota_risk';

function usagePercent(used: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function isNearOrOver(used: number, max: number): 'over' | 'near' | 'ok' {
  if (!Number.isFinite(max) || max <= 0) return 'ok';
  if (used >= max) return 'over';
  if (used / max >= 0.85) return 'near';
  return 'ok';
}

export default function MasterMonitoring() {
  const {
    organizations,
    isLoading,
    isActing,
    fetchAllOrgUsageMetrics,
    inspectOrganizationDetails,
    approveSubscription,
    toggleDisableOrganization,
    updateOrgSubscription,
    grantComplimentaryAccess,
    sendSubscriptionReminder,
    updateOrgMember,
    revokeOrgInvite,
    deleteOrganizationWorkspace,
  } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();

  const [usageMap, setUsageMap] = useState<Record<string, OrgUsageMetric>>({});
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [filter, setFilter] = useState<MonitoringFilter>('all');
  const [planFilter, setPlanFilter] = useState<'all' | Tenant['plan']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [inspectedOrg, setInspectedOrg] = useState<Tenant | null>(null);
  const [snapshot, setSnapshot] = useState<OrgDetailsSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const [triageOrg, setTriageOrg] = useState<Tenant | null>(null);
  const [triageMessage, setTriageMessage] = useState('');
  const [triageResult, setTriageResult] = useState<MasterTriageResult | null>(null);
  const [isTriaging, setIsTriaging] = useState(false);

  const loadUsageTelemetry = useCallback(async () => {
    if (organizations.length === 0) return;
    setLoadingUsage(true);
    try {
      const data = await fetchAllOrgUsageMetrics(organizations);
      setUsageMap(data);
    } finally {
      setLoadingUsage(false);
    }
  }, [organizations, fetchAllOrgUsageMetrics]);

  useEffect(() => {
    if (organizations.length > 0 && Object.keys(usageMap).length === 0) {
      void loadUsageTelemetry();
    }
  }, [organizations.length]);

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

  const refreshInspector = async (org: Tenant) => {
    setLoadingSnapshot(true);
    try {
      const snap = await inspectOrganizationDetails(org.id);
      setSnapshot(snap);
      const updatedUsage = await fetchAllOrgUsageMetrics([org]);
      setUsageMap((prev) => ({ ...prev, ...updatedUsage }));
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const liveInspectedOrg = useMemo(
    () =>
      inspectedOrg
        ? organizations.find((o) => o.id === inspectedOrg.id) || inspectedOrg
        : null,
    [inspectedOrg, organizations]
  );

  const rows = useMemo(() => {
    const nowMs = Date.now();
    const q = searchQuery.trim().toLowerCase();

    return organizations
      .map((org) => {
        const state = computeTrialState(org, nowMs);
        const quota = getPlanQuota(org.plan);
        const usage = usageMap[org.id];
        const productsUsed = usage?.productsCount ?? 0;
        const usersUsed = usage?.activeUsersCount ?? 1;
        const branchesUsed = usage?.branchesCount ?? 1;

        const prodRisk = isNearOrOver(productsUsed, quota.maxProducts);
        const userRisk = isNearOrOver(usersUsed, quota.maxUsers);
        const branchRisk = isNearOrOver(branchesUsed, quota.maxBranches);
        const hasQuotaRisk =
          prodRisk !== 'ok' || userRisk !== 'ok' || branchRisk !== 'ok';
        const isOverQuota =
          prodRisk === 'over' || userRisk === 'over' || branchRisk === 'over';

        return {
          org,
          state,
          quota,
          usage,
          prodRisk,
          userRisk,
          branchRisk,
          hasQuotaRisk,
          isOverQuota,
        };
      })
      .filter((item) => {
        const { org, state, hasQuotaRisk } = item;
        const hasPending = Boolean(org.pendingPlan || org.status === 'pending_approval');

        if (planFilter !== 'all' && org.plan !== planFilter) return false;
        if (filter === 'active' && !(state.isActive || state.isComplimentary)) return false;
        if (filter === 'trial' && !(state.isTrial && !state.isExpired)) return false;
        if (filter === 'pending' && !hasPending) return false;
        if (filter === 'locked' && !(state.isLocked || state.isSuspended || state.isExpired))
          return false;
        if (filter === 'quota_risk' && !hasQuotaRisk) return false;

        if (!q) return true;
        return (
          org.name.toLowerCase().includes(q) ||
          (org.ownerEmail || '').toLowerCase().includes(q) ||
          (org.ownerName || '').toLowerCase().includes(q) ||
          (org.pendingPaymentRef || '').toLowerCase().includes(q) ||
          org.id.toLowerCase().includes(q)
        );
      });
  }, [organizations, usageMap, filter, planFilter, searchQuery, plansConfig]);

  const summary = useMemo(() => {
    let overQuota = 0;
    let nearQuota = 0;
    let totalSkus = 0;
    let totalSales = 0;

    for (const org of organizations) {
      const quota = getPlanQuota(org.plan);
      const u = usageMap[org.id];
      if (!u) continue;
      totalSkus += u.productsCount;
      totalSales += u.salesCount;
      const p = isNearOrOver(u.productsCount, quota.maxProducts);
      const usr = isNearOrOver(u.activeUsersCount, quota.maxUsers);
      const b = isNearOrOver(u.branchesCount, quota.maxBranches);
      if (p === 'over' || usr === 'over' || b === 'over') overQuota += 1;
      else if (p === 'near' || usr === 'near' || b === 'near') nearQuota += 1;
    }

    return { overQuota, nearQuota, totalSkus, totalSales };
  }, [organizations, usageMap, plansConfig]);

  const masterInsights = useMemo(
    () => computeMasterWorkspaceInsights({ organizations, usageMap }),
    [organizations, usageMap]
  );

  const handleRunTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triageOrg || !triageMessage.trim()) return;
    setIsTriaging(true);
    try {
      const usage = usageMap[triageOrg.id];
      const quota = getPlanQuota(triageOrg.plan);
      const res = await runAiAssistantTool<MasterTriageResult>('master_triage', {
        inquiry: triageMessage.trim(),
        orgContext: {
          name: triageOrg.name,
          plan: triageOrg.plan,
          status: triageOrg.status,
          usage,
          quota,
        },
      });
      setTriageResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to triage support message');
    } finally {
      setIsTriaging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Business Monitoring &amp; Quota Compliance
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Track live SKU, staff seat, branch, and sales telemetry per business against strictly enforced plan limits.
          </p>
        </div>
        <button
          type="button"
          disabled={loadingUsage || organizations.length === 0}
          onClick={loadUsageTelemetry}
          className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw size={14} className={loadingUsage ? 'animate-spin' : ''} />
          {loadingUsage ? 'Syncing Telemetry...' : 'Refresh Telemetry'}
        </button>
      </div>

      {/* Telemetry Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-text-muted">Monitored Workspaces</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-primary mt-1">
            {organizations.length}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {plansConfig.strictEnforcement ? 'Strict quota blocking ON' : 'Soft warning mode'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-text-muted">At / Over Cap</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-danger mt-1">
            {summary.overQuota}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {summary.nearQuota} workspace(s) ≥85% capacity
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-text-muted">Platform Catalog SKUs</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-primary mt-1">
            {summary.totalSkus.toLocaleString()}
          </p>
          <p className="text-xs text-text-muted mt-0.5">Indexed across all stores</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-text-muted">Platform Sales Receipts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-accent mt-1">
            {summary.totalSales.toLocaleString()}
          </p>
          <p className="text-xs text-text-muted mt-0.5">Cumulative POS transactions</p>
        </div>
      </div>

      {/* SaaS AI Revenue, Upgrade & Churn Insights */}
      {masterInsights.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h2 className="text-sm font-bold text-primary">
                Upgrade, Trial-Conversion &amp; Churn Signals ({masterInsights.length})
              </h2>
            </div>
            <span className="text-[11px] text-text-muted">
              Deterministic usage vs plan caps
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {masterInsights.slice(0, 6).map((ins) => {
              const matchedOrg = organizations.find((o) => o.id === ins.orgId);
              return (
                <div
                  key={ins.orgId}
                  className="p-3 rounded-lg bg-surface-alt/60 border border-border flex flex-col justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-primary truncate">{ins.orgName}</span>
                      <span
                        className={cn(
                          'font-bold uppercase text-[10px] shrink-0',
                          ins.recommendationType === 'churn_risk'
                            ? 'text-danger'
                            : ins.recommendationType === 'upgrade'
                            ? 'text-accent'
                            : 'text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {ins.recommendationType.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="font-semibold text-primary mt-1">{ins.headline}</p>
                    <p className="text-text-secondary mt-0.5">{ins.reason}</p>
                  </div>
                  {matchedOrg && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setTriageOrg(matchedOrg);
                          setTriageMessage('');
                          setTriageResult(null);
                        }}
                        className="text-[11px] font-bold text-accent hover:underline whitespace-nowrap"
                      >
                        Triage / Draft Nudge
                      </button>
                      <button
                        type="button"
                        onClick={() => openInspector(matchedOrg)}
                        className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap"
                      >
                        Inspect →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active Paid' },
                { id: 'trial', label: 'Active Trial' },
                { id: 'pending', label: 'Pending Upgrade' },
                { id: 'locked', label: 'Locked / Expired' },
                { id: 'quota_risk', label: 'Near / At Cap' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap',
                  filter === tab.id
                    ? 'bg-[#0B1F3A] dark:bg-accent text-white border-[#0B1F3A] dark:border-accent'
                    : 'bg-surface text-text-secondary border-border hover:text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select
              className="input-sm w-full sm:w-auto"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as 'all' | Tenant['plan'])}
              aria-label="Filter by subscription tier"
            >
              <option value="all">All Tiers</option>
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {plansConfig.tiers[p].name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                placeholder="Search business, owner, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-sm pl-9 w-full"
              />
            </div>
          </div>
        </div>

        {/* Monitoring Table & Mobile Cards */}
        {isLoading ? (
          <>
            <div className="md:hidden border border-border rounded-xl divide-y divide-border">
              <MobileListSkeleton cards={4} />
            </div>
            <div className="hidden md:block overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                <thead className="bg-surface-alt border-b border-border text-[11px] font-bold text-text-secondary uppercase">
                  <tr>
                    <th className="p-3">Business &amp; Owner</th>
                    <th className="p-3">Tier &amp; Expiry</th>
                    <th className="p-3">SKUs Usage</th>
                    <th className="p-3">Staff Seats</th>
                    <th className="p-3">Branches</th>
                    <th className="p-3 text-right">Sales</th>
                    <th className="p-3">Compliance</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <TableRowsSkeleton rows={6} columns={8} compact />
                </tbody>
              </table>
            </div>
          </>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-muted border border-dashed border-border rounded-xl">
            <Activity size={24} className="mx-auto text-text-muted mb-2" />
            No businesses match the current filter criteria.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-border border border-border rounded-xl bg-surface">
              {rows.map(({ org, state, quota, usage, prodRisk, userRisk, branchRisk, isOverQuota, hasQuotaRisk }) => {
                const fee = org.isComplimentary
                  ? 0
                  : typeof org.customPriceUgx === 'number'
                  ? org.customPriceUgx
                  : quota.monthlyPriceUgx;
                const isLockedState = state.isLocked || state.isSuspended || state.isExpired;

                return (
                  <div key={org.id} className="p-4 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-primary truncate">{org.name}</p>
                        <p className="text-[11px] text-text-muted truncate">
                          {org.ownerEmail || org.ownerName || org.id.slice(0, 12)}
                        </p>
                      </div>
                      {org.pendingPlan ? (
                        <span className="text-amber-700 dark:text-amber-300 font-bold shrink-0">Pending Review</span>
                      ) : isLockedState ? (
                        <span className="text-danger font-bold shrink-0">
                          {org.locked || org.status === 'locked' || org.status === 'suspended' ? 'Locked' : 'Expired'}
                        </span>
                      ) : isOverQuota ? (
                        <span className="text-danger font-bold shrink-0">At Plan Cap</span>
                      ) : hasQuotaRisk ? (
                        <span className="text-amber-700 dark:text-amber-300 font-semibold shrink-0">Near Cap</span>
                      ) : state.isTrial ? (
                        <span className="text-primary font-semibold shrink-0">Trial OK</span>
                      ) : (
                        <span className="text-accent font-semibold shrink-0">Compliant</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
                      <span className="font-semibold text-primary">
                        {quota.name} ({org.isComplimentary ? 'Free' : formatUGX(fee)})
                      </span>
                      <span className="font-mono tabular-nums">
                        {state.isComplimentary && !state.effectiveEndsAt
                          ? 'No Expiry'
                          : state.effectiveEndsAt
                          ? `${formatDate(state.effectiveEndsAt.toISOString())} (${
                              state.isExpired ? 'Elapsed' : `${state.daysRemaining}d`
                            })`
                          : state.status}
                      </span>
                    </div>

                    {usage && (
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-surface-alt font-mono tabular-nums text-[11px]">
                        <div>
                          <span className="block text-[10px] text-text-muted">SKUs</span>
                          <span className={prodRisk === 'over' ? 'text-danger font-bold' : 'text-primary font-semibold'}>
                            {usage.productsCount}/{formatLimitDisplay(quota.maxProducts)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-text-muted">Seats</span>
                          <span className={userRisk === 'over' ? 'text-danger font-bold' : 'text-primary font-semibold'}>
                            {usage.activeUsersCount}/{formatLimitDisplay(quota.maxUsers)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] text-text-muted">Branches · Sales</span>
                          <span className={branchRisk === 'over' ? 'text-danger font-bold' : 'text-primary font-semibold'}>
                            {usage.branchesCount} · {usage.salesCount}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTriageOrg(org);
                          setTriageMessage('');
                          setTriageResult(null);
                        }}
                        className="btn btn-secondary py-1.5 px-2.5 text-xs min-h-[34px] gap-1"
                      >
                        <MessageSquareText size={12} className="text-accent" />
                        Triage
                      </button>
                      <button
                        type="button"
                        onClick={() => openInspector(org)}
                        className="btn btn-secondary py-1.5 px-2.5 text-xs min-h-[34px] gap-1"
                      >
                        <SlidersHorizontal size={12} />
                        Inspect
                      </button>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() =>
                          toggleDisableOrganization(
                            org,
                            !(org.locked || org.status === 'locked' || org.status === 'suspended'),
                            org.locked || org.status === 'locked' || org.status === 'suspended'
                              ? undefined
                              : 'Suspended via Master Monitoring'
                          )
                        }
                        className={cn(
                          'btn py-1.5 px-2.5 text-xs min-h-[34px] gap-1',
                          org.locked || org.status === 'locked' || org.status === 'suspended'
                            ? 'btn-primary'
                            : 'btn-secondary text-danger'
                        )}
                      >
                        {org.locked || org.status === 'locked' || org.status === 'suspended' ? (
                          <>
                            <Unlock size={12} />
                            Unlock
                          </>
                        ) : (
                          <>
                            <Lock size={12} />
                            Lock
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left border-collapse text-xs min-w-[860px]">
              <thead className="bg-surface-alt border-b border-border text-[11px] font-bold text-text-secondary uppercase">
                <tr>
                  <th className="p-3">Business &amp; Owner</th>
                  <th className="p-3">Tier &amp; Expiry</th>
                  <th className="p-3">SKUs Usage</th>
                  <th className="p-3">Staff Seats</th>
                  <th className="p-3">Branches</th>
                  <th className="p-3 text-right">Sales</th>
                  <th className="p-3">Compliance</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ org, state, quota, usage, prodRisk, userRisk, branchRisk, isOverQuota, hasQuotaRisk }) => {
                  const fee = org.isComplimentary
                    ? 0
                    : typeof org.customPriceUgx === 'number'
                    ? org.customPriceUgx
                    : quota.monthlyPriceUgx;
                  const prodPct = usage ? usagePercent(usage.productsCount, quota.maxProducts) : 0;
                  const userPct = usage ? usagePercent(usage.activeUsersCount, quota.maxUsers) : 0;
                  const isLockedState = state.isLocked || state.isSuspended || state.isExpired;

                  return (
                    <tr key={org.id} className="hover:bg-surface-alt/60">
                      <td className="p-3 min-w-[200px]">
                        <p className="font-bold text-primary truncate">{org.name}</p>
                        <p className="text-[11px] text-text-muted truncate">
                          {org.ownerEmail || org.ownerName || org.id.slice(0, 12)}
                        </p>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <p className="font-semibold text-primary">
                          {quota.name}{' '}
                          <span className="font-mono tabular-nums text-text-muted">
                            ({org.isComplimentary ? 'Free' : formatUGX(fee)})
                          </span>
                        </p>
                        <p
                          className={cn(
                            'text-[11px] font-mono tabular-nums',
                            state.isExpired
                              ? 'text-danger font-semibold'
                              : state.daysRemaining <= (plansConfig.reminderLeadDays || 3)
                              ? 'text-amber-700 dark:text-amber-300 font-semibold'
                              : 'text-text-muted'
                          )}
                        >
                          {state.isComplimentary && !state.effectiveEndsAt
                            ? 'Complimentary · No Expiry'
                            : state.effectiveEndsAt
                            ? `${formatDate(state.effectiveEndsAt.toISOString())} (${
                                state.isExpired ? 'Elapsed' : `${state.daysRemaining}d`
                              })`
                            : state.status}
                        </p>
                      </td>

                      <td className="p-3 min-w-[130px]">
                        {usage ? (
                          <div className="space-y-1">
                            <div className="flex justify-between font-mono tabular-nums text-[11px]">
                              <span
                                className={cn(
                                  'font-semibold',
                                  prodRisk === 'over'
                                    ? 'text-danger'
                                    : prodRisk === 'near'
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-primary'
                                )}
                              >
                                {usage.productsCount.toLocaleString()}
                              </span>
                              <span className="text-text-muted">
                                / {formatLimitDisplay(quota.maxProducts)}
                              </span>
                            </div>
                            {Number.isFinite(quota.maxProducts) && (
                              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    prodRisk === 'over'
                                      ? 'bg-danger'
                                      : prodRisk === 'near'
                                      ? 'bg-amber-500'
                                      : 'bg-accent'
                                  )}
                                  style={{ width: `${prodPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ) : loadingUsage ? (
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-1.5 w-full rounded-full" />
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      <td className="p-3 min-w-[120px]">
                        {usage ? (
                          <div className="space-y-1">
                            <div className="flex justify-between font-mono tabular-nums text-[11px]">
                              <span
                                className={cn(
                                  'font-semibold',
                                  userRisk === 'over'
                                    ? 'text-danger'
                                    : userRisk === 'near'
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-primary'
                                )}
                              >
                                {usage.activeUsersCount}
                                {usage.pendingInvitesCount > 0
                                  ? ` (+${usage.pendingInvitesCount})`
                                  : ''}
                              </span>
                              <span className="text-text-muted">
                                / {formatLimitDisplay(quota.maxUsers)}
                              </span>
                            </div>
                            {Number.isFinite(quota.maxUsers) && (
                              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    userRisk === 'over'
                                      ? 'bg-danger'
                                      : userRisk === 'near'
                                      ? 'bg-amber-500'
                                      : 'bg-accent'
                                  )}
                                  style={{ width: `${userPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ) : loadingUsage ? (
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-1.5 w-full rounded-full" />
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      <td className="p-3 font-mono tabular-nums whitespace-nowrap">
                        {usage ? (
                          <span
                            className={cn(
                              'font-semibold',
                              branchRisk === 'over'
                                ? 'text-danger'
                                : branchRisk === 'near'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-primary'
                            )}
                          >
                            {usage.branchesCount} / {formatLimitDisplay(quota.maxBranches)}
                          </span>
                        ) : loadingUsage ? (
                          <Skeleton className="h-3.5 w-12" />
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono tabular-nums font-semibold text-primary">
                        {usage ? (
                          usage.salesCount.toLocaleString()
                        ) : loadingUsage ? (
                          <Skeleton className="h-3.5 w-10 ml-auto" />
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {org.pendingPlan ? (
                          <span className="text-amber-700 dark:text-amber-300 font-bold">Pending Review</span>
                        ) : isLockedState ? (
                          <span className="text-danger font-bold">
                            {org.locked || org.status === 'locked' || org.status === 'suspended' ? 'Locked' : 'Expired'}
                          </span>
                        ) : isOverQuota ? (
                          <span className="text-danger font-bold inline-flex items-center gap-1">
                            <AlertTriangle size={12} />
                            At Plan Cap
                          </span>
                        ) : hasQuotaRisk ? (
                          <span className="text-amber-700 dark:text-amber-300 font-semibold">Near Cap</span>
                        ) : state.isTrial ? (
                          <span className="text-primary font-semibold">Trial OK</span>
                        ) : (
                          <span className="text-accent font-semibold">Compliant</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setTriageOrg(org);
                              setTriageMessage('');
                              setTriageResult(null);
                            }}
                            className="btn btn-secondary py-1 px-2 text-xs min-h-[30px] gap-1 whitespace-nowrap"
                            title="AI Billing / Support Triage"
                          >
                            <MessageSquareText size={12} className="text-accent" />
                            Triage
                          </button>
                          <button
                            type="button"
                            onClick={() => openInspector(org)}
                            className="btn btn-secondary py-1 px-2.5 text-xs min-h-[30px] gap-1 whitespace-nowrap"
                          >
                            <SlidersHorizontal size={12} />
                            Inspect
                          </button>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              toggleDisableOrganization(
                                org,
                                !(org.locked || org.status === 'locked' || org.status === 'suspended'),
                                org.locked || org.status === 'locked' || org.status === 'suspended'
                                  ? undefined
                                  : 'Suspended via Master Monitoring'
                              )
                            }
                            className={cn(
                              'btn py-1 px-2.5 text-xs min-h-[30px] gap-1 whitespace-nowrap',
                              org.locked || org.status === 'locked' || org.status === 'suspended'
                                ? 'btn-primary'
                                : 'btn-secondary text-danger'
                            )}
                            title={
                              org.locked || org.status === 'locked' || org.status === 'suspended'
                                ? 'Unlock Workspace'
                                : 'Lock Workspace'
                            }
                          >
                            {org.locked || org.status === 'locked' || org.status === 'suspended' ? (
                              <>
                                <Unlock size={12} />
                                Unlock
                              </>
                            ) : (
                              <>
                                <Lock size={12} />
                                Lock
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <OrgInspectorModal
        org={liveInspectedOrg}
        snapshot={snapshot}
        isLoading={loadingSnapshot}
        isActing={isActing}
        onClose={() => {
          setInspectedOrg(null);
          setSnapshot(null);
        }}
        onRefresh={refreshInspector}
        onApprove={approveSubscription}
        onToggleDisable={toggleDisableOrganization}
        onUpdateSubscription={updateOrgSubscription}
        onGrantComplimentary={grantComplimentaryAccess}
        onSendReminder={sendSubscriptionReminder}
        onUpdateMember={updateOrgMember}
        onRevokeInvite={revokeOrgInvite}
        onDeleteWorkspace={deleteOrganizationWorkspace}
      />

      {triageOrg && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-[#0B1F3A] text-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">AI Support &amp; Billing Triage</h3>
                <p className="text-xs text-white/75">
                  {triageOrg.name} · Plan: {triageOrg.plan}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTriageOrg(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close triage modal"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRunTriage} className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-bold text-primary mb-1">
                  Tenant Inquiry or Onboarding Note
                </label>
                <textarea
                  rows={3}
                  required
                  className="input w-full text-xs"
                  placeholder="Paste WhatsApp/email question from the business owner..."
                  value={triageMessage}
                  onChange={(e) => setTriageMessage(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={isTriaging || !triageMessage.trim()}
                className="btn btn-primary text-xs"
              >
                {isTriaging ? 'Analyzing...' : 'Classify & Draft Reply'}
              </button>

              {triageResult && (
                <div className="p-4 rounded-xl bg-surface-alt border border-border space-y-2">
                  <div className="flex justify-between font-bold text-primary">
                    <span>Category: {triageResult.category.replace(/_/g, ' ')}</span>
                    <span className="uppercase text-accent">Urgency: {triageResult.urgency}</span>
                  </div>
                  <p className="text-text-secondary">
                    {triageResult.reason}
                    {triageResult.suggestedPlan ? ` (Suggested plan: ${triageResult.suggestedPlan})` : ''}
                  </p>
                  <div className="p-3 bg-surface border border-border rounded-lg text-primary whitespace-pre-wrap">
                    {triageResult.draftReply}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(triageResult.draftReply);
                      toast.success('Reply copied to clipboard');
                    }}
                    className="btn btn-secondary text-xs py-1 px-3"
                  >
                    Copy Reply
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
