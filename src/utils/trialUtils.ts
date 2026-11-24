import { Tenant } from '../types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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
  wholeDaysRemaining: number;
  remainingHours: number;
  remainingMinutes: number;
  hoursRemaining: number;
  msRemaining: number;
  totalTrialDays: number;
  currentTrialDay: number;
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

function getLocalDayDiff(earlier: Date, later: Date): number {
  const startEarlier = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const startLater = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.max(0, Math.round((startLater - startEarlier) / DAY_MS));
}

export function formatRemainingCountdown(state: TrialState): string {
  if (state.isExpired || state.msRemaining <= 0) {
    return '0h remaining';
  }
  if (state.wholeDaysRemaining >= 1) {
    if (state.remainingHours > 0) {
      return `${state.wholeDaysRemaining}d ${state.remainingHours}h remaining`;
    }
    return `${state.wholeDaysRemaining} ${state.wholeDaysRemaining === 1 ? 'day' : 'days'} remaining`;
  }
  if (state.remainingHours >= 1) {
    if (state.remainingMinutes > 0) {
      return `${state.remainingHours}h ${state.remainingMinutes}m remaining`;
    }
    return `${state.remainingHours} ${state.remainingHours === 1 ? 'hour' : 'hours'} remaining`;
  }
  const mins = Math.max(1, state.remainingMinutes);
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'} remaining`;
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
      wholeDaysRemaining: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      hoursRemaining: 0,
      msRemaining: 0,
      totalTrialDays: 14,
      currentTrialDay: 0,
      trialEndsAt: null,
      subscribedAt: null,
      subscriptionEndsAt: null,
      effectiveEndsAt: null,
    };
  }

  const parsedCreated = tenant.createdAt ? new Date(tenant.createdAt) : null;
  const createdAt =
    parsedCreated && !Number.isNaN(parsedCreated.getTime()) ? parsedCreated : null;

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
  const isExplicitlyLocked = tenant.locked === true || tenant.status === 'locked';
  const isComplimentary = Boolean(
    tenant.isComplimentary && tenant.status === 'active' && !isExplicitlyLocked
  );

  const effectiveEndsAt = tenant.status === 'active' ? subscriptionEndsAt : trialEndsAt;
  const endsAtMs = effectiveEndsAt ? effectiveEndsAt.getTime() : 0;
  const msRemaining = endsAtMs > 0 ? Math.max(0, endsAtMs - nowMs) : 0;

  const daysRemaining = endsAtMs > 0 ? Math.ceil(msRemaining / DAY_MS) : 0;
  const wholeDaysRemaining = endsAtMs > 0 ? Math.floor(msRemaining / DAY_MS) : 0;
  const remainingHours = endsAtMs > 0 ? Math.floor((msRemaining % DAY_MS) / HOUR_MS) : 0;
  const remainingMinutes = endsAtMs > 0 ? Math.floor((msRemaining % HOUR_MS) / MINUTE_MS) : 0;
  const hoursRemaining = endsAtMs > 0 ? Math.ceil(msRemaining / HOUR_MS) : 0;

  const totalTrialDays =
    createdAt && trialEndsAt
      ? Math.max(1, Math.round((trialEndsAt.getTime() - createdAt.getTime()) / DAY_MS))
      : 14;
  const elapsedCalendarDays = createdAt ? getLocalDayDiff(createdAt, new Date(nowMs)) : 0;
  const currentTrialDay = isTrial
    ? Math.min(totalTrialDays, Math.max(1, elapsedCalendarDays + 1))
    : 0;

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
    wholeDaysRemaining,
    remainingHours,
    remainingMinutes,
    hoursRemaining,
    msRemaining,
    totalTrialDays,
    currentTrialDay,
    trialEndsAt,
    subscribedAt,
    subscriptionEndsAt,
    effectiveEndsAt,
  };
}
