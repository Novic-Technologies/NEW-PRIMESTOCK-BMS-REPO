import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { computeTrialState, TrialState } from '../utils/trialUtils';

export function useTrialGuard(): TrialState {
  const { tenant } = useAuthStore();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const syncNow = () => setNowMs(Date.now());
    syncNow();

    const interval = window.setInterval(syncNow, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncNow();
    };
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    tenant?.id,
    tenant?.status,
    tenant?.locked,
    tenant?.createdAt,
    tenant?.subscribedAt,
    tenant?.trialEndsAt,
    tenant?.subscriptionEndsAt,
    tenant?.isComplimentary,
  ]);

  return useMemo(() => computeTrialState(tenant, nowMs), [tenant, nowMs]);
}
