import { Tenant, TierFeatureKey } from '../types';
import {
  DEFAULT_PLATFORM_PLANS_CONFIG,
  PLAN_ORDER,
  getPlatformPlansConfig,
} from './platformPlans';

export type { TierFeatureKey };

export interface PlanQuota {
  id: Tenant['plan'];
  name: string;
  monthlyPriceUgx: number;
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  aiDailyAllowance: number;
  features: Record<TierFeatureKey, boolean>;
  highlights: string[];
  allowedUpgradeTargets: Array<Tenant['plan']>;
}

function toRuntimeLimit(val: number): number {
  return val < 0 ? Infinity : val;
}

function tierToQuota(tier: typeof DEFAULT_PLATFORM_PLANS_CONFIG.tiers.micro): PlanQuota {
  return {
    id: tier.id,
    name: tier.name,
    monthlyPriceUgx: tier.monthlyPriceUgx,
    maxUsers: toRuntimeLimit(tier.maxUsers),
    maxProducts: toRuntimeLimit(tier.maxProducts),
    maxBranches: toRuntimeLimit(tier.maxBranches),
    aiDailyAllowance: toRuntimeLimit(tier.aiDailyAllowance),
    features: { ...tier.features },
    highlights: [...tier.highlights],
    allowedUpgradeTargets: [...tier.allowedUpgradeTargets],
  };
}

export const PLAN_QUOTAS: Record<Tenant['plan'], PlanQuota> = {
  micro: tierToQuota(DEFAULT_PLATFORM_PLANS_CONFIG.tiers.micro),
  starter: tierToQuota(DEFAULT_PLATFORM_PLANS_CONFIG.tiers.starter),
  business: tierToQuota(DEFAULT_PLATFORM_PLANS_CONFIG.tiers.business),
  enterprise: tierToQuota(DEFAULT_PLATFORM_PLANS_CONFIG.tiers.enterprise),
};

export const FEATURE_MIN_PLAN: Record<TierFeatureKey, Tenant['plan']> = {
  whatsappReceipts: 'starter',
  suppliersAndPOs: 'starter',
  advancedReports: 'starter',
  multiBranchTransfers: 'business',
  payrollPayeNssf: 'business',
  aiRestockAndMargin: 'business',
};

export const FEATURE_LABELS: Record<TierFeatureKey, string> = {
  whatsappReceipts: 'WhatsApp Digital Receipts',
  suppliersAndPOs: 'Suppliers & Purchase Orders',
  advancedReports: 'Profit, Margin & VAT Reports',
  multiBranchTransfers: 'Inter-Branch Stock Transfers',
  payrollPayeNssf: 'Uganda PAYE & NSSF Payroll',
  aiRestockAndMargin: 'AI Smart Restock & Margin Optimizer',
};

export function getPlanQuota(plan?: Tenant['plan']): PlanQuota {
  const cfg = getPlatformPlansConfig();
  const key = plan || 'micro';
  const tier = cfg.tiers[key] || cfg.tiers.micro;
  return tierToQuota(tier);
}

/**
 * Dynamically identifies the lowest tier that enables a given feature
 * according to the live centralized Master Admin tier matrix.
 */
export function getFeatureMinPlan(feature: TierFeatureKey): Tenant['plan'] {
  const cfg = getPlatformPlansConfig();
  for (const planId of PLAN_ORDER) {
    if (cfg.tiers[planId]?.features?.[feature]) {
      return planId;
    }
  }
  return FEATURE_MIN_PLAN[feature] || 'enterprise';
}

/**
 * Returns the target plans a workspace is permitted to upgrade/switch to
 * based on its current plan and Master Admin's centralized upgrade-path matrix.
 * Renewing the active plan is always included so active/expired accounts can renew.
 */
export function getAllowedUpgradePlans(currentPlan?: Tenant['plan']): Array<Tenant['plan']> {
  const cfg = getPlatformPlansConfig();
  const activeKey = currentPlan || 'micro';
  const tier = cfg.tiers[activeKey] || cfg.tiers.micro;
  return Array.from(new Set([activeKey, ...(tier.allowedUpgradeTargets || [])]));
}

export function getTrialDaysCount(): number {
  return getPlatformPlansConfig().trialDays;
}

export function getDefaultSignupPlan(): Tenant['plan'] {
  return getPlatformPlansConfig().defaultSignupPlan;
}

/**
 * Strictly enforces the business workspace's subscribed plan tier and quotas.
 * Businesses never access features or quotas outside their subscribed tier.
 */
export function getEffectivePlanQuota(tenant: Tenant | null): PlanQuota {
  return getPlanQuota(tenant?.plan);
}

export function canAccessFeature(tenant: Tenant | null, feature: TierFeatureKey): boolean {
  const effective = getEffectivePlanQuota(tenant);
  return Boolean(effective.features[feature]);
}

export function isQuotaExceeded(currentCount: number, maxAllowed: number): boolean {
  const cfg = getPlatformPlansConfig();
  if (!cfg.strictEnforcement) return false;
  if (!Number.isFinite(maxAllowed)) return false;
  return currentCount >= maxAllowed;
}

const AI_USAGE_PREFIX = 'primestock_ai_usage_';

export function getDailyAiUsageCount(tenantId?: string): number {
  if (!tenantId) return 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(`${AI_USAGE_PREFIX}${tenantId}_${today}`);
    return Number(raw) || 0;
  } catch {
    return 0;
  }
}

export function incrementDailyAiUsage(tenantId?: string): number {
  if (!tenantId) return 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `${AI_USAGE_PREFIX}${tenantId}_${today}`;
    const next = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function canUseAiCall(tenant: Tenant | null): {
  allowed: boolean;
  used: number;
  limit: number;
} {
  const quota = getEffectivePlanQuota(tenant);
  const used = getDailyAiUsageCount(tenant?.id);
  const cfg = getPlatformPlansConfig();
  const allowed =
    !cfg.strictEnforcement ||
    !Number.isFinite(quota.aiDailyAllowance) ||
    used < quota.aiDailyAllowance;
  return {
    allowed,
    used,
    limit: quota.aiDailyAllowance,
  };
}
