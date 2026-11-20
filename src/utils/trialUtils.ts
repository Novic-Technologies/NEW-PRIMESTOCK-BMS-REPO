import { Tenant } from '../types';

export interface TrialState {
  isTrial: boolean;
  isActive: boolean;
  isSuspended: boolean;
  isLocked: boolean;
  isPendingApproval: boolean;
  isComplimentary: boolean;
  isExpired: boolean;
  isSoftLocked: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  trialEndsAt: Date | null;
  subscribedAt: Date | null;
  subscriptionEndsAt: Date | null;
  effectiveEndsAt: Date | null;
}

/**
 * Adds exact calendar months (preserving day-of-month where possible,
 * clamping to month-end e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function addCalendarMonths(baseDate: Date, months = 1): Date {
  const target = new Date(baseDate.getTime());
  const originalDay = target.getDate();
  target.setMonth(target.getMonth() + months);
  if (target.getDate() < originalDay) {
    target.setDate(0);
  }
  return target;
}

export function computeTrialState(tenant: Tenant | null, nowMs = Date.now()): TrialState {
  if (!tenant) {
    return {
      isTrial: false,
      isActive: false,
      isSuspended: false,
      isLocked: false,
      isPendingApproval: false,
      isComplimentary: false,
      isExpired: false,
      isSoftLocked: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      trialEndsAt: null,
      subscribedAt: null,
      subscriptionEndsAt: null,
      effectiveEndsAt: null,
    };
  }

  const parsedTrial = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  const trialEndsAt = parsedTrial && !Number.isNaN(parsedTrial.getTime()) ? parsedTrial : null;

  const parsedSubscribed = tenant.subscribedAt ? new Date(tenant.subscribedAt) : null;
  const subscribedAt =
    parsedSubscribed && !Number.isNaN(parsedSubscribed.getTime()) ? parsedSubscribed : null;

  const parsedSubEnd = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : null;
  let subscriptionEndsAt =
    parsedSubEnd && !Number.isNaN(parsedSubEnd.getTime()) ? parsedSubEnd : null;

  // Monthly subscription rule: if subscribedAt is recorded without an explicit end date,
  // count 1 calendar month from subscribedAt (unless complimentary open-ended grant).
  if (!subscriptionEndsAt && subscribedAt && !tenant.isComplimentary) {
    subscriptionEndsAt = addCalendarMonths(subscribedAt, 1);
  }

  const isTrial = tenant.status === 'trial';
  const isSuspended = tenant.status === 'suspended';
  const isPendingApproval = tenant.status === 'pending_approval';
  const isComplimentary = Boolean(tenant.isComplimentary && tenant.status === 'active' && !tenant.locked);
  const isExplicitlyLocked = tenant.locked === true;

  const effectiveEndsAt = tenant.status === 'active' ? subscriptionEndsAt : trialEndsAt;
  const endsAtMs = effectiveEndsAt ? effectiveEndsAt.getTime() : 0;
  const msRemaining = endsAtMs > 0 ? Math.max(0, endsAtMs - nowMs) : 0;
  const daysRemaining = endsAtMs > 0 ? Math.ceil(msRemaining / (24 * 60 * 60 * 1000)) : 0;
  const hoursRemaining = endsAtMs > 0 ? Math.ceil(msRemaining / (60 * 60 * 1000)) : 0;

  const trialWindowElapsed = isTrial && endsAtMs > 0 && nowMs >= endsAtMs;
  const subWindowElapsed =
    tenant.status === 'active' &&
    !isComplimentary &&
    subscriptionEndsAt !== null &&
    nowMs >= subscriptionEndsAt.getTime();
  const complimentaryExpired =
    Boolean(tenant.isComplimentary) && subscriptionEndsAt !== null && nowMs >= subscriptionEndsAt.getTime();

  const isExpired =
    isExplicitlyLocked ||
    isSuspended ||
    isPendingApproval ||
    trialWindowElapsed ||
    subWindowElapsed ||
    complimentaryExpired;
  const isActive =
    tenant.status === 'active' && !isExplicitlyLocked && !subWindowElapsed && !complimentaryExpired;
  const isSoftLocked = isExplicitlyLocked || (!isActive && (isTrial ? trialWindowElapsed : true));

  return {
    isTrial,
    isActive,
    isSuspended,
    isLocked: isExplicitlyLocked || isSuspended,
    isPendingApproval,
    isComplimentary,
    isExpired,
    isSoftLocked,
    daysRemaining,
    hoursRemaining,
    trialEndsAt,
    subscribedAt,
    subscriptionEndsAt,
    effectiveEndsAt,
  };
}
