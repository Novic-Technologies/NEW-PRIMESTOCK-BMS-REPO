import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Lock, ArrowRight, Gift, Bell, X } from 'lucide-react';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { useAuthStore } from '../../store/authStore';
import { hasSectionAccess } from '../../utils/rbac';
import { cn } from '../../lib/utils';

export function TrialBanner() {
  const { tenant, user } = useAuthStore();
  const canManageBilling = hasSectionAccess(user, 'billing');
  const {
    isTrial,
    isActive,
    isSoftLocked,
    isSuspended,
    isPendingApproval,
    isComplimentary,
    daysRemaining,
    hoursRemaining,
    effectiveEndsAt,
  } = useTrialGuard();

  const [dismissedReminderAt, setDismissedReminderAt] = useState<string | null>(null);

  const hasReminder =
    Boolean(tenant?.lastReminderMessage && tenant?.lastReminderAt) &&
    dismissedReminderAt !== tenant?.lastReminderAt;

  const showPaidRenewalWarning =
    isActive && !isComplimentary && effectiveEndsAt !== null && daysRemaining <= 5;

  const showTrialBanner = isTrial || isSoftLocked || showPaidRenewalWarning || isComplimentary;

  if (!showTrialBanner && !hasReminder) return null;

  return (
    <div className="no-print">
      {hasReminder && (
        <div className="bg-accent-alt/15 border-b border-accent-alt/30 px-4 md:px-8 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-primary">
            <Bell size={16} className="text-accent-alt shrink-0" />
            <span>
              <strong>Billing Reminder:</strong> {tenant?.lastReminderMessage}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canManageBilling && (
              <Link
                to="/billing"
                className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
              >
                Open Billing
              </Link>
            )}
            <button
              type="button"
              aria-label="Dismiss reminder"
              onClick={() => setDismissedReminderAt(tenant?.lastReminderAt || null)}
              className="p-1 text-text-muted hover:text-primary rounded"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {isSoftLocked ? (
        <div className="bg-danger/10 border-b border-danger/25 px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-sm text-primary">
            {isPendingApproval ? (
              <Clock size={17} className="text-accent-alt shrink-0" />
            ) : (
              <Lock size={17} className="text-danger shrink-0" />
            )}
            <span>
              {isPendingApproval ? (
                <>
                  <strong>Payment Submitted — Awaiting Master Admin Approval:</strong> Ref{' '}
                  <span className="font-mono">{tenant?.pendingPaymentRef || 'Pending'}</span> for{' '}
                  <strong>{(tenant?.pendingPlan || tenant?.plan || '').toUpperCase()}</strong> is under
                  review. Access unlocks automatically once approved.
                </>
              ) : isSuspended ? (
                <>
                  <strong>Workspace Disabled:</strong>{' '}
                  {tenant?.disabledReason ||
                    'Access has been paused by the platform administrator. Contact support or settle billing to restore access.'}
                </>
              ) : !isTrial && effectiveEndsAt ? (
                <>
                  <strong>Subscription Expired:</strong> Your business records are preserved. Submit
                  renewal payment in Billing for approval to resume operations.
                </>
              ) : (
                <>
                  <strong>14-Day Free Trial Ended:</strong> All your sales, products, and customer records
                  are safely preserved. Submit plan payment in Billing for Master Admin approval to unlock
                  full access.
                </>
              )}
            </span>
          </div>
          {canManageBilling && (
            <Link
              to="/billing"
              className="text-xs font-bold text-danger hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Go to Billing <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : isComplimentary ? (
        <div className="bg-accent/10 border-b border-accent/25 px-4 md:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-primary">
            <Gift size={15} className="text-accent shrink-0" />
            <span>
              <strong>Complimentary Free Access Active</strong>
              {tenant?.complimentaryNote ? ` · ${tenant.complimentaryNote}` : ''}
              {effectiveEndsAt ? ` · Valid until ${effectiveEndsAt.toLocaleDateString('en-UG')}` : ''}
            </span>
          </div>
        </div>
      ) : showPaidRenewalWarning ? (
        <div className="bg-accent-alt/10 border-b border-accent-alt/25 px-4 md:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-primary">
            <Clock size={15} className="text-accent-alt shrink-0" />
            <span>
              Subscription expires in{' '}
              <strong className="font-mono tabular-nums">
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
              </strong>
              . Submit renewal early so your workspace stays uninterrupted.
            </span>
          </div>
          {canManageBilling && (
            <Link
              to="/billing"
              className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Renew Plan <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : isTrial ? (
        <div
          className={cn(
            'border-b px-4 md:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm',
            daysRemaining <= 3
              ? 'bg-accent-alt/10 border-accent-alt/25 text-primary'
              : 'bg-primary/5 border-border text-primary'
          )}
        >
          <div className="flex items-center gap-2">
            <Clock
              size={15}
              className={daysRemaining <= 3 ? 'text-accent-alt shrink-0' : 'text-accent shrink-0'}
            />
            <span>
              14-Day Free Trial ·{' '}
              <strong className="font-mono tabular-nums">
                {daysRemaining <= 1
                  ? `${hoursRemaining} ${hoursRemaining === 1 ? 'hour' : 'hours'} remaining`
                  : `${daysRemaining} days remaining`}
              </strong>
            </span>
          </div>
          {canManageBilling && (
            <Link
              to="/billing"
              className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Choose a Plan <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
