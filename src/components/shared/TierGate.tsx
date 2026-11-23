import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import {
  canAccessFeature,
  FEATURE_LABELS,
  getFeatureMinPlan,
  getPlanQuota,
  TierFeatureKey,
} from '../../utils/planLimits';
import { usePlatformPlansConfig } from '../../utils/platformPlans';
import { formatUGX } from '../../utils/format';

interface TierGateProps {
  feature: TierFeatureKey;
  children: React.ReactNode;
}

export function TierGate({ feature, children }: TierGateProps) {
  const { tenant } = useAuthStore();
  // Subscribe reactively to central platformConfig/plans updates
  usePlatformPlansConfig();

  if (canAccessFeature(tenant, feature)) {
    return <>{children}</>;
  }

  const minPlanKey = getFeatureMinPlan(feature);
  const minPlan = getPlanQuota(minPlanKey);
  const currentPlan = getPlanQuota(tenant?.plan);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="card p-8 text-center space-y-5 border-border">
        <div className="w-14 h-14 rounded-2xl bg-primary/5 text-primary flex items-center justify-center mx-auto">
          <Lock size={28} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">
            Requires {minPlan.name} Pack or Higher
          </p>
          <h1 className="text-2xl font-bold text-primary">{FEATURE_LABELS[feature]}</h1>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            Your workspace is currently on the <strong>{currentPlan.name}</strong> plan (
            {formatUGX(currentPlan.monthlyPriceUgx)}/month). Upgrade to{' '}
            <strong>{minPlan.name}</strong> ({formatUGX(minPlan.monthlyPriceUgx)}/month) to unlock{' '}
            {FEATURE_LABELS[feature]}.
          </p>
        </div>

        <div className="bg-surface-alt/60 border border-border rounded-xl p-4 text-left max-w-md mx-auto space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Included in {minPlan.name}
          </p>
          {minPlan.highlights.map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-primary font-medium">
              <CheckCircle2 size={14} className="text-accent shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link to="/" className="btn btn-secondary whitespace-nowrap">
            Back to Dashboard
          </Link>
          <Link to="/billing" className="btn btn-primary gap-1.5 whitespace-nowrap">
            <span>Upgrade in Billing</span>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
