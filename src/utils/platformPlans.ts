import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  PlatformPlanTierConfig,
  PlatformPlansConfig,
  Tenant,
  TierFeatureKey,
} from '../types';

export const PLAN_ORDER: Array<Tenant['plan']> = ['micro', 'starter', 'business', 'enterprise'];

export const DEFAULT_PLATFORM_PLANS_CONFIG: PlatformPlansConfig = {
  id: 'plans',
  defaultSignupPlan: 'micro',
  trialDays: 14,
  reminderLeadDays: 3,
  strictEnforcement: true,
  autoLockExpired: true,
  multiMonthDiscounts: {
    m1: 0,
    m3: 5,
    m6: 10,
    m12: 15,
  },
  upgradeHeadline: 'Upgrade anytime to unlock multi-branch stock transfers, PAYE/NSSF payroll, and higher SKU & staff limits.',
  tiers: {
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
      allowedUpgradeTargets: ['starter', 'business', 'enterprise'],
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
      allowedUpgradeTargets: ['business', 'enterprise'],
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
      allowedUpgradeTargets: ['enterprise'],
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      monthlyPriceUgx: 350000,
      maxUsers: -1,
      maxProducts: -1,
      maxBranches: -1,
      aiDailyAllowance: -1,
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
      allowedUpgradeTargets: [],
    },
  },
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const VALID_PLANS = new Set<Tenant['plan']>(PLAN_ORDER);
const FEATURE_KEYS: TierFeatureKey[] = [
  'whatsappReceipts',
  'suppliersAndPOs',
  'advancedReports',
  'multiBranchTransfers',
  'payrollPayeNssf',
  'aiRestockAndMargin',
];

function normalizeLimitNumber(val: unknown, fallback: number): number {
  if (val === -1 || val === Infinity) return -1;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return -1;
  return Math.round(n);
}

function normalizeTier(
  planId: Tenant['plan'],
  rawTier?: Partial<PlatformPlanTierConfig> | null
): PlatformPlanTierConfig {
  const def = DEFAULT_PLATFORM_PLANS_CONFIG.tiers[planId];
  if (!rawTier || typeof rawTier !== 'object') {
    return {
      ...def,
      features: { ...def.features },
      highlights: [...def.highlights],
      allowedUpgradeTargets: [...def.allowedUpgradeTargets],
    };
  }

  const features = { ...def.features };
  for (const key of FEATURE_KEYS) {
    if (rawTier.features && typeof rawTier.features[key] === 'boolean') {
      features[key] = rawTier.features[key];
    }
  }

  const allowedUpgradeTargets = Array.isArray(rawTier.allowedUpgradeTargets)
    ? Array.from(
        new Set(
          rawTier.allowedUpgradeTargets.filter(
            (p): p is Tenant['plan'] => VALID_PLANS.has(p) && p !== planId
          )
        )
      )
    : [...def.allowedUpgradeTargets];

  const highlights = Array.isArray(rawTier.highlights)
    ? rawTier.highlights
        .map((h) => String(h || '').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 8)
    : [...def.highlights];

  return {
    id: planId,
    name: String(rawTier.name || def.name).trim().slice(0, 60) || def.name,
    monthlyPriceUgx: Math.max(0, Math.round(Number(rawTier.monthlyPriceUgx ?? def.monthlyPriceUgx) || 0)),
    maxUsers: normalizeLimitNumber(rawTier.maxUsers, def.maxUsers),
    maxProducts: normalizeLimitNumber(rawTier.maxProducts, def.maxProducts),
    maxBranches: normalizeLimitNumber(rawTier.maxBranches, def.maxBranches),
    aiDailyAllowance: normalizeLimitNumber(rawTier.aiDailyAllowance, def.aiDailyAllowance),
    features,
    highlights: highlights.length > 0 ? highlights : [...def.highlights],
    allowedUpgradeTargets,
  };
}

export function normalizePlatformPlansConfig(
  raw?: Partial<PlatformPlansConfig> | null
): PlatformPlansConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_PLATFORM_PLANS_CONFIG,
      multiMonthDiscounts: { ...DEFAULT_PLATFORM_PLANS_CONFIG.multiMonthDiscounts },
      tiers: {
        micro: normalizeTier('micro'),
        starter: normalizeTier('starter'),
        business: normalizeTier('business'),
        enterprise: normalizeTier('enterprise'),
      },
    };
  }

  const defaultSignupPlan = VALID_PLANS.has(raw.defaultSignupPlan as Tenant['plan'])
    ? (raw.defaultSignupPlan as Tenant['plan'])
    : DEFAULT_PLATFORM_PLANS_CONFIG.defaultSignupPlan;

  const trialDays = Math.min(90, Math.max(1, Math.round(Number(raw.trialDays ?? 14) || 14)));
  const reminderLeadDays = Math.min(30, Math.max(1, Math.round(Number(raw.reminderLeadDays ?? 3) || 3)));

  const dRaw = raw.multiMonthDiscounts || ({} as Partial<PlatformPlansConfig['multiMonthDiscounts']>);
  const clampDisc = (v: unknown, fb: number) =>
    Math.min(60, Math.max(0, Math.round(Number(v ?? fb) || 0)));

  return {
    id: 'plans',
    defaultSignupPlan,
    trialDays,
    reminderLeadDays,
    strictEnforcement: raw.strictEnforcement !== undefined ? Boolean(raw.strictEnforcement) : true,
    autoLockExpired: raw.autoLockExpired !== undefined ? Boolean(raw.autoLockExpired) : true,
    multiMonthDiscounts: {
      m1: clampDisc(dRaw.m1, DEFAULT_PLATFORM_PLANS_CONFIG.multiMonthDiscounts.m1),
      m3: clampDisc(dRaw.m3, DEFAULT_PLATFORM_PLANS_CONFIG.multiMonthDiscounts.m3),
      m6: clampDisc(dRaw.m6, DEFAULT_PLATFORM_PLANS_CONFIG.multiMonthDiscounts.m6),
      m12: clampDisc(dRaw.m12, DEFAULT_PLATFORM_PLANS_CONFIG.multiMonthDiscounts.m12),
    },
    upgradeHeadline: raw.upgradeHeadline
      ? String(raw.upgradeHeadline).trim().slice(0, 240)
      : DEFAULT_PLATFORM_PLANS_CONFIG.upgradeHeadline,
    tiers: {
      micro: normalizeTier('micro', raw.tiers?.micro),
      starter: normalizeTier('starter', raw.tiers?.starter),
      business: normalizeTier('business', raw.tiers?.business),
      enterprise: normalizeTier('enterprise', raw.tiers?.enterprise),
    },
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy || undefined,
  };
}

let livePlatformPlansConfig: PlatformPlansConfig = normalizePlatformPlansConfig(
  DEFAULT_PLATFORM_PLANS_CONFIG
);
const listeners = new Set<(cfg: PlatformPlansConfig) => void>();

export function getPlatformPlansConfig(): PlatformPlansConfig {
  return livePlatformPlansConfig;
}

export function setSyncedPlatformPlansConfig(next: PlatformPlansConfig) {
  livePlatformPlansConfig = normalizePlatformPlansConfig(next);
  listeners.forEach((cb) => cb(livePlatformPlansConfig));
}

export function subscribePlatformPlansConfig(
  cb: (cfg: PlatformPlansConfig) => void
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Mount once at App root so every workspace and Master Admin console stays synced
 * with centralized tier quotas & upgrade path configuration from Firestore.
 */
export function usePlatformPlansSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const ref = doc(db, 'platformConfig', 'plans');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setSyncedPlatformPlansConfig(snap.data() as PlatformPlansConfig);
        } else {
          setSyncedPlatformPlansConfig(DEFAULT_PLATFORM_PLANS_CONFIG);
        }
      },
      () => {
        // Unauthenticated login screen or transient offline error: keep defaults
      }
    );
    return () => unsub();
  }, [enabled]);
}

export function usePlatformPlansConfig() {
  const [config, setConfig] = useState<PlatformPlansConfig>(() => getPlatformPlansConfig());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubLocal = subscribePlatformPlansConfig((next) => setConfig(next));
    const ref = doc(db, 'platformConfig', 'plans');
    const unsubSnap = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const normalized = normalizePlatformPlansConfig(snap.data() as PlatformPlansConfig);
          setSyncedPlatformPlansConfig(normalized);
          setConfig(normalized);
        } else {
          const fallback = normalizePlatformPlansConfig(DEFAULT_PLATFORM_PLANS_CONFIG);
          setConfig(fallback);
        }
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      }
    );

    return () => {
      unsubLocal();
      unsubSnap();
    };
  }, []);

  return { config, isLoading };
}

export function formatLimitDisplay(limit: number): string {
  if (limit < 0 || !Number.isFinite(limit)) return 'Unlimited';
  return limit.toLocaleString();
}

export function getCycleDiscountPercent(
  months: 1 | 3 | 6 | 12,
  config: PlatformPlansConfig = getPlatformPlansConfig()
): number {
  if (months === 3) return config.multiMonthDiscounts.m3;
  if (months === 6) return config.multiMonthDiscounts.m6;
  if (months === 12) return config.multiMonthDiscounts.m12;
  return config.multiMonthDiscounts.m1;
}

export function computeCycleBillingTotal(
  monthlyPriceUgx: number,
  months: 1 | 3 | 6 | 12,
  config: PlatformPlansConfig = getPlatformPlansConfig()
): { grossUgx: number; discountPercent: number; discountUgx: number; netUgx: number } {
  const grossUgx = Math.max(0, Math.round(monthlyPriceUgx * months));
  const discountPercent = getCycleDiscountPercent(months, config);
  const discountUgx = Math.round((grossUgx * discountPercent) / 100);
  return {
    grossUgx,
    discountPercent,
    discountUgx,
    netUgx: Math.max(0, grossUgx - discountUgx),
  };
}
