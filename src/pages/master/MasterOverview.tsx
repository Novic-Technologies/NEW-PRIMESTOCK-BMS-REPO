import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Layers,
  Lock,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useMasterAdmin } from '../../hooks/useMasterAdmin';
import { getPlanQuota } from '../../utils/planLimits';
import { PLAN_ORDER, formatLimitDisplay, usePlatformPlansConfig } from '../../utils/platformPlans';
import { computeTrialState } from '../../utils/trialUtils';
import { formatDate, formatUGX } from '../../utils/format';
import { KpiValueSkeleton, Skeleton } from '../../components/shared/Skeletons';

export default function MasterOverview() {
  const { organizations, isLoading } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();

  const metrics = useMemo(() => {
    let activePaid = 0;
    let trials = 0;
    let pendingApprovals = 0;
    let lockedOrExpired = 0;
    let mrrUgx = 0;
    let expiringSoon = 0;

    const byPlan = PLAN_ORDER.reduce((acc, p) => {
      acc[p] = { count: 0, mrr: 0 };
      return acc;
    }, {} as Record<(typeof PLAN_ORDER)[number], { count: number; mrr: number }>);

    organizations.forEach((org) => {
      const state = computeTrialState(org);
      const quota = getPlanQuota(org.plan);
      const fee =
        typeof org.customPriceUgx === 'number' ? org.customPriceUgx : quota.monthlyPriceUgx;

      if (byPlan[org.plan]) {
        byPlan[org.plan].count += 1;
      }

      if (org.pendingPlan) pendingApprovals += 1;
      if (state.isLocked || state.isSuspended || state.isExpired) lockedOrExpired += 1;

      if (org.status === 'active' && !org.locked) {
        activePaid += 1;
        if (!org.isComplimentary) {
          mrrUgx += fee;
          if (byPlan[org.plan]) byPlan[org.plan].mrr += fee;
        }
        if (state.effectiveEndsAt && state.daysRemaining <= (plansConfig.reminderLeadDays || 3)) {
          expiringSoon += 1;
        }
      } else if (org.status === 'trial' && !state.isExpired) {
        trials += 1;
      }
    });

    return {
      total: organizations.length,
      activePaid,
      trials,
      pendingApprovals,
      lockedOrExpired,
      expiringSoon,
      mrrUgx,
      byPlan,
    };
  }, [organizations, plansConfig]);

  const pendingOrgs = useMemo(
    () => organizations.filter((o) => Boolean(o.pendingPlan)).slice(0, 6),
    [organizations]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Platform Control Overview
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Real-time health, recurring revenue, and subscription tier governance across all merchant businesses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/master/monitoring" className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap">
            <Activity size={15} />
            Business Monitoring
          </Link>
          <Link to="/master/users" className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap">
            <Users size={15} />
            All User Accounts
          </Link>
          <Link to="/master/plans" className="btn btn-primary text-xs gap-1.5 whitespace-nowrap">
            <Layers size={15} />
            Configure Tiers &amp; Paths
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Total Businesses</span>
            <Building2 size={16} />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-16" /> : metrics.total}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {metrics.activePaid} active · {metrics.trials} trial
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Platform MRR</span>
            <TrendingUp size={16} className="text-accent" />
          </div>
          <p className="text-2xl font-bold text-accent font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-28" /> : formatUGX(metrics.mrrUgx)}
          </p>
          <p className="text-xs text-text-muted mt-1">Monthly recurring revenue</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Pending Upgrades</span>
            <CheckCircle2 size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.pendingApprovals}
          </p>
          <p className="text-xs text-text-muted mt-1">Awaiting payment review</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Expiring Soon</span>
            <Clock size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.expiringSoon}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Within {plansConfig.reminderLeadDays} day(s)
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Locked / Expired</span>
            <Lock size={16} className="text-danger" />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.lockedOrExpired}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {plansConfig.strictEnforcement ? 'Strict quota mode ON' : 'Soft quota mode'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tier Distribution & Active Rules */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-primary">
                Subscription Tier Distribution &amp; Quotas
              </h2>
              <p className="text-xs text-text-muted">
                Live enforcement thresholds configured in Tiers &amp; Upgrade Paths.
              </p>
            </div>
            <Link
              to="/master/plans"
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              Edit Quotas
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[560px]">
              <thead className="bg-surface-alt border-b border-border">
                <tr>
                  <th className="p-3 font-bold text-text-secondary uppercase">Tier</th>
                  <th className="p-3 font-bold text-text-secondary uppercase text-right">Monthly Fee</th>
                  <th className="p-3 font-bold text-text-secondary uppercase text-right">SKUs / Users / Branches</th>
                  <th className="p-3 font-bold text-text-secondary uppercase text-right">Orgs</th>
                  <th className="p-3 font-bold text-text-secondary uppercase text-right">Tier MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PLAN_ORDER.map((planId) => {
                  const tier = plansConfig.tiers[planId];
                  const stats = metrics.byPlan[planId];
                  return (
                    <tr key={planId} className="hover:bg-surface-alt">
                      <td className="p-3">
                        <p className="font-bold text-primary">{tier.name}</p>
                        <p className="text-[11px] text-text-muted">
                          Upgrades →{' '}
                          {tier.allowedUpgradeTargets.length > 0
                            ? tier.allowedUpgradeTargets.map((t) => plansConfig.tiers[t].name).join(', ')
                            : 'Top Tier'}
                        </p>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-semibold text-primary">
                        {formatUGX(tier.monthlyPriceUgx)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-text-secondary">
                        {formatLimitDisplay(tier.maxProducts)} / {formatLimitDisplay(tier.maxUsers)} /{' '}
                        {formatLimitDisplay(tier.maxBranches)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-primary">
                        {stats.count}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-accent">
                        {formatUGX(stats.mrr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Payment Queue Snapshot */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-primary">Pending Payment Approvals</h2>
              <Link
                to="/master/approvals"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                Open Queue
                <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-2.5 w-48" />
                    </div>
                    <Skeleton className="h-4 w-20 shrink-0" />
                  </div>
                ))
              ) : pendingOrgs.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-muted">
                  All submitted subscription payments have been reviewed.
                </div>
              ) : (
                pendingOrgs.map((org) => (
                  <div key={org.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-primary truncate">{org.name}</p>
                      <p className="text-[11px] text-text-muted truncate">
                        {getPlanQuota(org.pendingPlan).name} · Ref: {org.pendingPaymentRef || '—'} ·{' '}
                        {org.pendingSubmittedAt ? formatDate(org.pendingSubmittedAt) : 'Recent'}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-primary shrink-0">
                      {formatUGX(
                        org.pendingAmountUgx || getPlanQuota(org.pendingPlan).monthlyPriceUgx
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-3.5 bg-surface-alt border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <Link
              to="/master/payments"
              className="p-2.5 rounded-lg bg-surface border border-border font-semibold text-primary hover:border-accent flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <CreditCard size={14} className="text-accent" />
                Payment Channels
              </span>
              <ArrowUpRight size={13} />
            </Link>
            <Link
              to="/master/system"
              className="p-2.5 rounded-lg bg-surface border border-border font-semibold text-primary hover:border-accent flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
                Expiry Sweep
              </span>
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
