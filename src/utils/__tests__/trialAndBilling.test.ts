import { describe, expect, it } from 'vitest';
import { Tenant } from '../../types';
import {
  addCalendarMonths,
  computeTrialState,
  formatRemainingCountdown,
} from '../trialUtils';

const BASE_CREATED = new Date('2026-11-01T08:00:00.000Z');
const BASE_TRIAL_END = new Date(BASE_CREATED.getTime() + 14 * 24 * 60 * 60 * 1000);

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant_test_1',
    name: 'Kampala Hardware Ltd',
    plan: 'starter',
    status: 'trial',
    createdAt: BASE_CREATED.toISOString(),
    trialEndsAt: BASE_TRIAL_END.toISOString(),
    ...overrides,
  };
}

describe('computeTrialState & dynamic day-by-day countdown', () => {
  it('shows Day 1 of 14 and 14 days remaining immediately at registration', () => {
    const state = computeTrialState(makeTenant(), BASE_CREATED.getTime());
    expect(state.isTrial).toBe(true);
    expect(state.isSoftLocked).toBe(false);
    expect(state.totalTrialDays).toBe(14);
    expect(state.currentTrialDay).toBe(1);
    expect(state.wholeDaysRemaining).toBe(14);
    expect(state.remainingHours).toBe(0);
    expect(formatRemainingCountdown(state)).toBe('14 days remaining');
  });

  it('decrements days & hours accurately as calendar days advance', () => {
    const nextDay = BASE_CREATED.getTime() + (25 * 60 * 60 * 1000);
    const state = computeTrialState(makeTenant(), nextDay);
    expect(state.currentTrialDay).toBe(2);
    expect(state.wholeDaysRemaining).toBe(12);
    expect(state.remainingHours).toBe(23);
    expect(formatRemainingCountdown(state)).toBe('12d 23h remaining');
  });

  it('switches cleanly to hours & minutes during the final 24 hours', () => {
    const finalHours = BASE_TRIAL_END.getTime() - (5 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const state = computeTrialState(makeTenant(), finalHours);
    expect(state.isSoftLocked).toBe(false);
    expect(state.wholeDaysRemaining).toBe(0);
    expect(state.remainingHours).toBe(5);
    expect(state.remainingMinutes).toBe(30);
    expect(formatRemainingCountdown(state)).toBe('5h 30m remaining');
  });

  it('marks expired trial as expired and soft-locked once trialEndsAt elapses', () => {
    const expiredAt = BASE_TRIAL_END.getTime() + 60_000;
    const state = computeTrialState(makeTenant(), expiredAt);
    expect(state.isExpired).toBe(true);
    expect(state.isSoftLocked).toBe(true);
    expect(formatRemainingCountdown(state)).toBe('0h remaining');
  });

  it('enforces explicit locked status regardless of dates', () => {
    const state = computeTrialState(
      makeTenant({ status: 'locked', locked: true }),
      BASE_CREATED.getTime() + 1000
    );
    expect(state.isSoftLocked).toBe(true);
    expect(state.isLocked).toBe(true);
  });

  it('handles calendar month rollover accurately without day overflow', () => {
    const jan31 = new Date(2027, 0, 31, 10, 0, 0);
    const nextMonth = addCalendarMonths(jan31, 1);
    expect(nextMonth.getFullYear()).toBe(2027);
    expect(nextMonth.getMonth()).toBe(1); // February
    expect(nextMonth.getDate()).toBe(28);
  });
});
