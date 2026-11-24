import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useMasterAdmin } from '../../hooks/useMasterAdmin';
import {
  PlatformPlanTierConfig,
  PlatformPlansConfig,
  Tenant,
  TierFeatureKey,
} from '../../types';
import { FEATURE_LABELS } from '../../utils/planLimits';
import {
  DEFAULT_PLATFORM_PLANS_CONFIG,
  PLAN_ORDER,
  formatLimitDisplay,
  normalizePlatformPlansConfig,
  usePlatformPlansConfig,
} from '../../utils/platformPlans';
import { formatDate, formatUGX } from '../../utils/format';
import { cn } from '../../lib/utils';

const FEATURE_KEYS: TierFeatureKey[] = [
  'whatsappReceipts',
  'suppliersAndPOs',
  'advancedReports',
  'multiBranchTransfers',
  'payrollPayeNssf',
  'aiRestockAndMargin',
];

export default function MasterTiersUpgrades() {
  const { isActing, savePlatformPlansConfig } = useMasterAdmin();
  const { config: liveConfig, isLoading } = usePlatformPlansConfig();

  const [draft, setDraft] = useState<PlatformPlansConfig>(() =>
    normalizePlatformPlansConfig(DEFAULT_PLATFORM_PLANS_CONFIG)
  );
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isLoading && !isDirty) {
      setDraft(normalizePlatformPlansConfig(liveConfig));
    }
  }, [liveConfig, isLoading, isDirty]);

  const updateTier = (
    planId: Tenant['plan'],
    patch: Partial<PlatformPlanTierConfig>
  ) => {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [planId]: {
          ...prev.tiers[planId],
          ...patch,
        },
      },
    }));
  };

  const toggleTierFeature = (planId: Tenant['plan'], feature: TierFeatureKey) => {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [planId]: {
          ...prev.tiers[planId],
          features: {
            ...prev.tiers[planId].features,
            [feature]: !prev.tiers[planId].features[feature],
          },
        },
      },
    }));
  };

  const toggleUpgradeTarget = (
    sourcePlan: Tenant['plan'],
    targetPlan: Tenant['plan']
  ) => {
    if (sourcePlan === targetPlan) return;
    setIsDirty(true);
    setDraft((prev) => {
      const currentTargets = prev.tiers[sourcePlan].allowedUpgradeTargets || [];
      const exists = currentTargets.includes(targetPlan);
      const nextTargets = exists
        ? currentTargets.filter((p) => p !== targetPlan)
        : PLAN_ORDER.filter(
            (p) => p !== sourcePlan && (p === targetPlan || currentTargets.includes(p))
          );

      return {
        ...prev,
        tiers: {
          ...prev.tiers,
          [sourcePlan]: {
            ...prev.tiers[sourcePlan],
            allowedUpgradeTargets: nextTargets,
          },
        },
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await savePlatformPlansConfig(draft);
    if (ok) setIsDirty(false);
  };

  const handleResetDefaults = () => {
    setDraft(normalizePlatformPlansConfig(DEFAULT_PLATFORM_PLANS_CONFIG));
    setIsDirty(true);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Tiers, Quotas &amp; Upgrade Paths
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Central governance over subscription pricing, strict quota caps, feature gates, and permitted tier upgrade transitions across all merchants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isActing}
            onClick={handleResetDefaults}
            className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>
          <button
            type="submit"
            disabled={isActing}
            className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
          >
            <Save size={14} />
            {isActing ? 'Publishing...' : 'Save & Enforce System-Wide'}
          </button>
        </div>
      </div>

      {/* 1. Global Lifecycle & Enforcement Policies */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-primary flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent" />
              Global Onboarding, Renewal &amp; Enforcement Controls
            </h2>
            <p className="text-xs text-text-muted">
              Applied automatically to new business registrations, Billing checkout calculations, and expiry sweeps.
            </p>
          </div>
          {draft.updatedAt && (
            <span className="text-[11px] font-mono text-text-muted">
              Synced {formatDate(draft.updatedAt)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Default Signup Trial Tier
            </label>
            <select
              className="input w-full text-xs"
              value={draft.defaultSignupPlan}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({
                  ...p,
                  defaultSignupPlan: e.target.value as Tenant['plan'],
                }));
              }}
            >
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {draft.tiers[p].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Free Trial Length (Days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              className="input w-full text-xs font-mono tabular-nums"
              value={draft.trialDays}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({
                  ...p,
                  trialDays: Math.max(1, Math.min(90, Number(e.target.value) || 14)),
                }));
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Pre-Expiry Reminder Lead (Days)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              className="input w-full text-xs font-mono tabular-nums"
              value={draft.reminderLeadDays}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({
                  ...p,
                  reminderLeadDays: Math.max(1, Math.min(30, Number(e.target.value) || 3)),
                }));
              }}
            />
          </div>

          <div className="flex flex-col justify-center gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={draft.strictEnforcement}
                onChange={(e) => {
                  setIsDirty(true);
                  setDraft((p) => ({ ...p, strictEnforcement: e.target.checked }));
                }}
              />
              Strict Quota Blocking
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoLockExpired}
                onChange={(e) => {
                  setIsDirty(true);
                  setDraft((p) => ({ ...p, autoLockExpired: e.target.checked }));
                }}
              />
              Auto-Lock Expired Workspaces
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
          {(
            [
              { key: 'm1', label: '1-Month Discount (%)' },
              { key: 'm3', label: '3-Month Discount (%)' },
              { key: 'm6', label: '6-Month Discount (%)' },
              { key: 'm12', label: '12-Month Discount (%)' },
            ] as const
          ).map((item) => (
            <div key={item.key}>
              <label className="block text-[11px] font-bold text-text-secondary mb-1">
                {item.label}
              </label>
              <input
                type="number"
                min={0}
                max={60}
                className="input w-full text-xs font-mono tabular-nums"
                value={draft.multiMonthDiscounts[item.key]}
                onChange={(e) => {
                  setIsDirty(true);
                  const val = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                  setDraft((p) => ({
                    ...p,
                    multiMonthDiscounts: {
                      ...p.multiMonthDiscounts,
                      [item.key]: val,
                    },
                  }));
                }}
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold text-primary mb-1">
            Merchant Billing Page Banner Headline
          </label>
          <input
            type="text"
            maxLength={240}
            className="input w-full text-xs"
            value={draft.upgradeHeadline || ''}
            onChange={(e) => {
              setIsDirty(true);
              setDraft((p) => ({ ...p, upgradeHeadline: e.target.value }));
            }}
          />
        </div>
      </div>

      {/* 2. Per-Tier Pricing & Quota Caps */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLAN_ORDER.map((planId) => {
          const tier = draft.tiers[planId];
          return (
            <div
              key={planId}
              className="bg-surface border border-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="text-[11px] font-mono uppercase font-bold text-text-muted">
                  {planId}
                </span>
                <span className="text-xs font-bold font-mono tabular-nums text-accent">
                  {formatUGX(tier.monthlyPriceUgx)}/mo
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-secondary mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  className="input w-full text-xs font-semibold"
                  value={tier.name}
                  onChange={(e) => updateTier(planId, { name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-secondary mb-1">
                  Monthly Fee (UGX)
                </label>
                <input
                  type="number"
                  min={0}
                  className="input w-full text-xs font-mono tabular-nums"
                  value={tier.monthlyPriceUgx}
                  onChange={(e) =>
                    updateTier(planId, {
                      monthlyPriceUgx: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-text-secondary mb-1">
                    Max SKUs (-1 = ∞)
                  </label>
                  <input
                    type="number"
                    min={-1}
                    className="input w-full text-xs font-mono tabular-nums"
                    value={tier.maxProducts}
                    onChange={(e) =>
                      updateTier(planId, { maxProducts: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-secondary mb-1">
                    Max Staff (-1 = ∞)
                  </label>
                  <input
                    type="number"
                    min={-1}
                    className="input w-full text-xs font-mono tabular-nums"
                    value={tier.maxUsers}
                    onChange={(e) =>
                      updateTier(planId, { maxUsers: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-secondary mb-1">
                    Max Branches
                  </label>
                  <input
                    type="number"
                    min={-1}
                    className="input w-full text-xs font-mono tabular-nums"
                    value={tier.maxBranches}
                    onChange={(e) =>
                      updateTier(planId, { maxBranches: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-secondary mb-1">
                    AI Calls / Day
                  </label>
                  <input
                    type="number"
                    min={-1}
                    className="input w-full text-xs font-mono tabular-nums"
                    value={tier.aiDailyAllowance}
                    onChange={(e) =>
                      updateTier(planId, {
                        aiDailyAllowance: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-secondary mb-1">
                  Billing Card Highlights (one per line)
                </label>
                <textarea
                  rows={3}
                  className="input w-full text-[11px]"
                  value={tier.highlights.join('\n')}
                  onChange={(e) =>
                    updateTier(planId, {
                      highlights: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>

              <div className="pt-1 border-t border-border text-[11px] text-text-muted font-mono">
                Enforced: {formatLimitDisplay(tier.maxProducts)} SKUs ·{' '}
                {formatLimitDisplay(tier.maxUsers)} users ·{' '}
                {formatLimitDisplay(tier.maxBranches)} branch(es)
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Feature Gate Matrix */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-primary flex items-center gap-2">
            <Layers size={16} className="text-accent" />
            Interactive Module &amp; Feature Gate Matrix
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Toggle which tiers unlock each operational module. TierGate and Billing immediately enforce changes live.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[680px]">
            <thead className="bg-surface-alt border-b border-border text-[11px] font-bold text-text-secondary uppercase">
              <tr>
                <th className="p-3.5">Capability / Module</th>
                {PLAN_ORDER.map((planId) => (
                  <th key={planId} className="p-3.5 text-center">
                    {draft.tiers[planId].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {FEATURE_KEYS.map((featureKey) => (
                <tr key={featureKey} className="hover:bg-surface-alt">
                  <td className="p-3.5 font-semibold text-primary">
                    {FEATURE_LABELS[featureKey]}
                  </td>
                  {PLAN_ORDER.map((planId) => {
                    const enabled = draft.tiers[planId].features[featureKey];
                    return (
                      <td key={planId} className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleTierFeature(planId, featureKey)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition-colors',
                            enabled
                              ? 'bg-accent/10 text-accent border-accent/30'
                              : 'bg-surface-alt text-text-muted border-border'
                          )}
                        >
                          {enabled ? <CheckCircle2 size={13} /> : <Lock size={12} />}
                          {enabled ? 'Unlocked' : 'Locked'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Central Upgrade Paths Matrix */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-primary">
            Permitted Upgrade Paths Matrix
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Control which destination tiers a business on a given plan is permitted to upgrade or switch into from its Billing console (renewing the active plan is always allowed).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead className="bg-surface-alt border-b border-border text-[11px] font-bold text-text-secondary uppercase">
              <tr>
                <th className="p-3.5">Current Business Tier</th>
                {PLAN_ORDER.map((targetId) => (
                  <th key={targetId} className="p-3.5 text-center">
                    → {draft.tiers[targetId].name}
                  </th>
                ))}
                <th className="p-3.5">Active Upgrade Path Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PLAN_ORDER.map((sourceId) => {
                const targets = draft.tiers[sourceId].allowedUpgradeTargets || [];
                return (
                  <tr key={sourceId} className="hover:bg-surface-alt">
                    <td className="p-3.5 font-bold text-primary">
                      {draft.tiers[sourceId].name}
                    </td>
                    {PLAN_ORDER.map((targetId) => {
                      const isSelf = sourceId === targetId;
                      const checked = targets.includes(targetId);
                      return (
                        <td key={targetId} className="p-3.5 text-center">
                          {isSelf ? (
                            <span className="text-[11px] font-semibold text-text-muted">
                              Renewal Only
                            </span>
                          ) : (
                            <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleUpgradeTarget(sourceId, targetId)}
                              />
                              <span
                                className={
                                  checked
                                    ? 'font-semibold text-accent'
                                    : 'text-text-muted'
                                }
                              >
                                {checked ? 'Allowed' : 'Blocked'}
                              </span>
                            </label>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3.5 text-text-secondary">
                      {targets.length === 0 ? (
                        <span className="text-text-muted">Renewal of current tier only</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 flex-wrap font-medium">
                          {draft.tiers[sourceId].name}
                          <ArrowRight size={12} className="text-accent" />
                          {targets.map((t) => draft.tiers[t].name).join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  );
}
