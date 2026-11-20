import { Tenant } from '../types';
import { computeTrialState } from './trialUtils';

export type TierFeatureKey =
  | 'whatsappReceipts'
  | 'suppliersAndPOs'
  | 'advancedReports'
  | 'multiBranchTransfers'
  | 'payrollPayeNssf'
  | 'aiRestockAndMargin';

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
}

export const PLAN_QUOTAS: Record<Tenant['plan'], PlanQuota> = {
  micro: {
    id: 'micro',
    name: 'Micro / Shop',
    monthlyPriceUgx: 35000,
    maxUsers: 2,
    maxProducts: 500,
    maxBranches: 1,
    aiDailyAllowance: 25,
    features: {
      whatsappReceipts: false,
      suppliersAndPOs: false,
      advancedReports: false,
      multiBranchTransfers: false,
      payrollPayeNssf: false,
      aiRestockAndMargin: false,
    },
    highlights: [
      '2 Staff Users & 1 Branch',
      'Up to 500 Products',
      'POS, Sales, Inventory & Expenses',
      '25 AI Copilot Calls/day',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUgx: 75000,
    maxUsers: 5,
    maxProducts: 2000,
    maxBranches: 1,
    aiDailyAllowance: 100,
    features: {
      whatsappReceipts: true,
      suppliersAndPOs: true,
      advancedReports: true,
      multiBranchTransfers: false,
      payrollPayeNssf: false,
      aiRestockAndMargin: false,
    },
    highlights: [
      'Up to 5 Staff Users & 1 Branch',
      'Up to 2,000 Products',
      'WhatsApp Receipts, Suppliers, POs & Reports',
      '100 AI Copilot Calls/day',
    ],
  },
  business: {
    id: 'business',
    name: 'Business Growth',
    monthlyPriceUgx: 150000,
    maxUsers: 15,
    maxProducts: 10000,
    maxBranches: 3,
    aiDailyAllowance: 500,
    features: {
      whatsappReceipts: true,
      suppliersAndPOs: true,
      advancedReports: true,
      multiBranchTransfers: true,
      payrollPayeNssf: true,
      aiRestockAndMargin: true,
    },
    highlights: [
      'Up to 15 Staff Users & 3 Branches',
      'Up to 10,000 Products & Stock Transfers',
      'Uganda PAYE/NSSF Payroll & AI Restock Forecast',
      '500 AI Copilot Calls/day',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUgx: 350000,
    maxUsers: Infinity,
    maxProducts: Infinity,
    maxBranches: Infinity,
    aiDailyAllowance: Infinity,
    features: {
      whatsappReceipts: true,
      suppliersAndPOs: true,
      advancedReports: true,
      multiBranchTransfers: true,
      payrollPayeNssf: true,
      aiRestockAndMargin: true,
    },
    highlights: [
      'Unlimited Staff Users & Branches',
      'Unlimited Products & Multi-Branch Transfers',
      'Full PAYE/NSSF Payroll, Reports & Priority Support',
      'Unlimited AI Copilot Calls/day',
    ],
  },
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
  return PLAN_QUOTAS[plan || 'micro'] || PLAN_QUOTAS.micro;
}

/**
 * Active 14-day trials get Business evaluation capabilities so teams can test
 * Payroll, Purchase Orders, Reports, Multi-Branch, and AI Restock before selecting a tier.
 * Active paid / complimentary subscriptions strictly enforce their subscribed tier.
 */
export function getEffectivePlanQuota(tenant: Tenant | null): PlanQuota {
  if (!tenant) return PLAN_QUOTAS.micro;
  const trialState = computeTrialState(tenant);
  if (trialState.isTrial && !trialState.isExpired) {
    return PLAN_QUOTAS.business;
  }
  return getPlanQuota(tenant.plan);
}

export function canAccessFeature(tenant: Tenant | null, feature: TierFeatureKey): boolean {
  const effective = getEffectivePlanQuota(tenant);
  return Boolean(effective.features[feature]);
}

export function isQuotaExceeded(currentCount: number, maxAllowed: number): boolean {
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
  const allowed = !Number.isFinite(quota.aiDailyAllowance) || used < quota.aiDailyAllowance;
  return {
    allowed,
    used,
    limit: quota.aiDailyAllowance,
  };
}
