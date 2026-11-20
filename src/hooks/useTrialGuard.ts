import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { computeTrialState, TrialState } from '../utils/trialUtils';

export function useTrialGuard(): TrialState {
  const { tenant } = useAuthStore();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [
    tenant?.id,
    tenant?.status,
    tenant?.locked,
    tenant?.subscribedAt,
    tenant?.trialEndsAt,
    tenant?.subscriptionEndsAt,
    tenant?.isComplimentary,
  ]);

  return useMemo(() => computeTrialState(tenant, nowMs), [tenant, nowMs]);
}
