import { useEffect, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import {
  AppNotification,
  BillingHistory,
  Branch,
  SubscriptionReminder,
  Tenant,
  TenantMember,
} from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { addCalendarMonths, computeTrialState } from '../utils/trialUtils';
import { getPlanQuota } from '../utils/planLimits';
import { formatDate, formatUGX } from '../utils/format';
import {
  buildSubscriptionEmailHtml,
  sendTransactionalEmail,
  sendWhatsAppReminder,
} from '../services/notificationService';
import toast from 'react-hot-toast';

export interface OrgDetailsSnapshot {
  branches: Branch[];
  members: TenantMember[];
  billingHistory: BillingHistory[];
  reminders: SubscriptionReminder[];
}

export interface SweepReport {
  checkedCount: number;
  lockedCount: number;
  remindedCount: number;
  emailedCount: number;
  whatsappLinks: Array<{ tenantName: string; url: string }>;
}

export function useMasterAdmin() {
  const { user, isMasterAdmin } = useAuthStore();
  const [organizations, setOrganizations] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    if (!isMasterAdmin) {
      setOrganizations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(collection(db, 'tenants'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tenant));
        setOrganizations(list);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'tenants');
        } catch (structuredErr) {
          console.error(structuredErr);
        }
        toast.error('Unable to load platform organizations. Ensure your Master email is verified.');
      }
    );

    return () => unsub();
  }, [isMasterAdmin]);

  const clearPendingFields = () => ({
    pendingPlan: deleteField(),
    pendingAmountUgx: deleteField(),
    pendingPaymentMethod: deleteField(),
    pendingPaymentRef: deleteField(),
    pendingTransactionId: deleteField(),
    pendingPayerPhone: deleteField(),
    pendingInvoiceId: deleteField(),
    pendingSubmittedAt: deleteField(),
  });

  const writeTenantNotification = async (
    tenantId: string,
    payload: Omit<AppNotification, 'id' | 'tenantId' | 'read' | 'createdAt'>
  ) => {
    const id = crypto.randomUUID();
    const docData: AppNotification = stripUndefined({
      ...payload,
      id,
      tenantId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, `tenants/${tenantId}/notifications`, id), docData);
  };

  const approveSubscription = async (
    target: Tenant,
    options: {
      plan?: Tenant['plan'];
      months?: number;
      durationDays?: number;
      customPriceUgx?: number | null;
    }
  ): Promise<boolean> => {
    if (!user || !isMasterAdmin || isActing) return false;
    setIsActing(true);
    const now = new Date();
    const nowIso = now.toISOString();
    const chosenPlan = options.plan || target.pendingPlan || target.plan;

    const existingEndMs = target.subscriptionEndsAt ? new Date(target.subscriptionEndsAt).getTime() : 0;
    const baseDate = target.status === 'active' && !target.locked && existingEndMs > now.getTime()
      ? new Date(existingEndMs)
      : now;

    const monthsCount = options.months && options.months > 0 ? options.months : 1;
    const expiryDate = options.durationDays
      ? new Date(baseDate.getTime() + Math.max(1, options.durationDays) * 86_400_000)
      : addCalendarMonths(baseDate, monthsCount);
    const newExpiryIso = expiryDate.toISOString();
    const subscribedAtIso =
      target.status === 'active' && !target.locked && target.subscribedAt
        ? target.subscribedAt
        : nowIso;

    try {
      const updatePayload: Record<string, unknown> = {
        plan: chosenPlan,
        status: 'active',
        locked: false,
        subscribedAt: subscribedAtIso,
        subscriptionEndsAt: newExpiryIso,
        isComplimentary: false,
        autoRemindersEnabled: target.autoRemindersEnabled ?? true,
        complimentaryNote: deleteField(),
        disabledReason: deleteField(),
        approvedBy: user.email || user.uid,
        approvedAt: nowIso,
        ...clearPendingFields(),
        ...(options.customPriceUgx !== undefined && options.customPriceUgx !== null
          ? { customPriceUgx: options.customPriceUgx }
          : options.customPriceUgx === null
          ? { customPriceUgx: deleteField() }
          : {}),
      };

      await updateDoc(doc(db, 'tenants', target.id), updatePayload);

      if (target.pendingInvoiceId) {
        await updateDoc(doc(db, `tenants/${target.id}/billingHistory`, target.pendingInvoiceId), {
          status: 'Paid',
          reviewedBy: user.email || user.uid,
          reviewedAt: nowIso,
        });
      }

      const quota = getPlanQuota(chosenPlan);
      const approvalMessage = `Your ${quota.name} subscription has been approved and activated through ${formatDate(
        newExpiryIso
      )}. All features for your tier are now unlocked.`;

      await writeTenantNotification(target.id, {
        title: `Subscription Activated · ${quota.name}`,
        message: approvalMessage,
        category: 'billing',
        severity: 'info',
        actionRoute: '/billing',
        channel: 'all',
      }).catch(() => {});

      if (target.ownerEmail) {
        await sendTransactionalEmail({
          to: target.ownerEmail,
          subject: `Subscription Approved — ${target.name} (${quota.name})`,
          text: `${approvalMessage}\n\nPlan: ${quota.name}\nActive Until: ${formatDate(newExpiryIso)}`,
          html: buildSubscriptionEmailHtml({
            businessName: target.name,
            headline: 'Subscription Approved & Activated',
            message: approvalMessage,
            planLabel: `${quota.name} (${formatUGX(
              typeof options.customPriceUgx === 'number'
                ? options.customPriceUgx
                : quota.monthlyPriceUgx
            )}/month)`,
            expiryLabel: formatDate(newExpiryIso),
            actionLabel: 'Open Workspace',
          }),
        }).catch(() => {});
      }

      toast.success(`Approved ${target.name} on ${quota.name} until ${newExpiryIso.slice(0, 10)}`);
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `tenants/${target.id}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to approve subscription');
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const rejectSubscription = async (target: Tenant, reason: string): Promise<boolean> => {
    if (!user || !isMasterAdmin || isActing) return false;
    setIsActing(true);
    const nowIso = new Date().toISOString();
    const cleanReason = reason.trim() || 'Payment reference could not be verified.';

    const subStillValid =
      Boolean(target.isComplimentary) ||
      Boolean(target.subscriptionEndsAt && new Date(target.subscriptionEndsAt).getTime() > Date.now());
    const trialStillValid =
      Boolean(target.trialEndsAt && new Date(target.trialEndsAt).getTime() > Date.now() && !target.subscribedAt);
    const fallbackStatus: Tenant['status'] = subStillValid
      ? 'active'
      : trialStillValid
      ? 'trial'
      : 'suspended';

    try {
      await updateDoc(doc(db, 'tenants', target.id), {
        status: fallbackStatus,
        locked: fallbackStatus === 'suspended',
        ...(fallbackStatus === 'suspended' ? { disabledReason: cleanReason } : {}),
        ...clearPendingFields(),
      });

      if (target.pendingInvoiceId) {
        await updateDoc(doc(db, `tenants/${target.id}/billingHistory`, target.pendingInvoiceId), {
          status: 'Rejected',
          rejectionReason: cleanReason,
          reviewedBy: user.email || user.uid,
          reviewedAt: nowIso,
        });
      }

      const declineMsg = `Your recent subscription payment verification was declined: ${cleanReason}. Please resubmit a valid MoMo/Airtel/Bank reference in Billing.`;
      await writeTenantNotification(target.id, {
        title: 'Payment Verification Declined',
        message: declineMsg,
        category: 'billing',
        severity: 'critical',
        actionRoute: '/billing',
        channel: 'all',
      }).catch(() => {});

      if (target.ownerEmail) {
        await sendTransactionalEmail({
          to: target.ownerEmail,
          subject: `Action Needed: Subscription Payment Declined — ${target.name}`,
          text: declineMsg,
          html: buildSubscriptionEmailHtml({
            businessName: target.name,
            headline: 'Subscription Payment Declined',
            message: declineMsg,
            actionLabel: 'Resubmit Payment in Billing',
          }),
        }).catch(() => {});
      }

      toast.success(`Payment declined for ${target.name}`);
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `tenants/${target.id}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to decline payment');
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const grantComplimentaryAccess = async (
    target: Tenant,
    options: {
      plan: Tenant['plan'];
      durationDays: number | null;
      note: string;
    }
  ): Promise<boolean> => {
    if (!user || !isMasterAdmin || isActing) return false;
    setIsActing(true);
    const nowIso = new Date().toISOString();
    const cleanNote = options.note.trim() || 'Complimentary free access granted by Novic Technologies';
    const expiryIso =
      options.durationDays && options.durationDays > 0
        ? new Date(Date.now() + options.durationDays * 86_400_000).toISOString()
        : null;

    try {
      await updateDoc(doc(db, 'tenants', target.id), {
        plan: options.plan,
        status: 'active',
        locked: false,
        subscribedAt: target.subscribedAt || nowIso,
        isComplimentary: true,
        complimentaryNote: cleanNote,
        customPriceUgx: 0,
        disabledReason: deleteField(),
        approvedBy: user.email || user.uid,
        approvedAt: nowIso,
        ...(expiryIso ? { subscriptionEndsAt: expiryIso } : { subscriptionEndsAt: deleteField() }),
        ...clearPendingFields(),
      });

      const invoiceId = crypto.randomUUID();
      const invoice: BillingHistory = {
        id: invoiceId,
        tenantId: target.id,
        plan: options.plan,
        amount: 0,
        paymentMethod: 'Complimentary Grant',
        status: 'Complimentary',
        reference: `FREE-${Date.now().toString().slice(-6)}`,
        reviewedBy: user.email || user.uid,
        reviewedAt: nowIso,
        createdAt: nowIso,
      };
      await setDoc(doc(db, `tenants/${target.id}/billingHistory`, invoiceId), invoice);

      const quota = getPlanQuota(options.plan);
      const freeMessage = `${cleanNote}${
        expiryIso ? ` · Valid until ${formatDate(expiryIso)}.` : ' · Unlimited complimentary access.'
      }`;
      await writeTenantNotification(target.id, {
        title: `Complimentary ${quota.name} Access Granted`,
        message: freeMessage,
        category: 'billing',
        severity: 'info',
        actionRoute: '/billing',
        channel: 'all',
      }).catch(() => {});

      if (target.ownerEmail) {
        await sendTransactionalEmail({
          to: target.ownerEmail,
          subject: `Complimentary Free Access Granted — ${target.name} (${quota.name})`,
          text: freeMessage,
          html: buildSubscriptionEmailHtml({
            businessName: target.name,
            headline: `Complimentary ${quota.name} Access Active`,
            message: freeMessage,
            planLabel: `${quota.name} (UGX 0 / Complimentary)`,
            expiryLabel: expiryIso ? formatDate(expiryIso) : 'No Expiry',
            actionLabel: 'Open Workspace',
          }),
        }).catch(() => {});
      }

      toast.success(`${target.name} now has free (${quota.name}) access`);
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `tenants/${target.id}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to grant free access');
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const toggleDisableOrganization = async (
    target: Tenant,
    disable: boolean,
    reason?: string
  ): Promise<boolean> => {
    if (!user || !isMasterAdmin || isActing) return false;
    setIsActing(true);
    try {
      if (disable) {
        const cleanReason = reason?.trim() || 'Access disabled by platform administrator.';
        await updateDoc(doc(db, 'tenants', target.id), {
          status: 'suspended',
          locked: true,
          disabledReason: cleanReason,
        });
        await writeTenantNotification(target.id, {
          title: 'Workspace Suspended',
          message: cleanReason,
          category: 'billing',
          severity: 'critical',
          actionRoute: '/billing',
          channel: 'all',
        }).catch(() => {});
        if (target.ownerEmail) {
          await sendTransactionalEmail({
            to: target.ownerEmail,
            subject: `Workspace Disabled — ${target.name}`,
            text: `Your ${target.name} workspace has been suspended: ${cleanReason}`,
            html: buildSubscriptionEmailHtml({
              businessName: target.name,
              headline: 'Workspace Access Paused',
              message: cleanReason,
              actionLabel: 'Review Billing',
            }),
          }).catch(() => {});
        }
        toast.success(`${target.name} has been locked & disabled`);
      } else {
        const subStillValid =
          Boolean(target.isComplimentary) ||
          (target.subscriptionEndsAt && new Date(target.subscriptionEndsAt).getTime() > Date.now());
        const trialStillValid =
          target.trialEndsAt && new Date(target.trialEndsAt).getTime() > Date.now();
        const nextStatus: Tenant['status'] = subStillValid
          ? 'active'
          : trialStillValid
          ? 'trial'
          : 'active';
        const fallbackExpiry =
          !subStillValid && nextStatus === 'active'
            ? addCalendarMonths(new Date(), 1).toISOString()
            : undefined;

        await updateDoc(doc(db, 'tenants', target.id), {
          status: nextStatus,
          locked: false,
          disabledReason: deleteField(),
          ...(fallbackExpiry ? { subscribedAt: new Date().toISOString(), subscriptionEndsAt: fallbackExpiry } : {}),
        });
        const restoreMsg = 'Your business workspace access has been restored by Novic Technologies.';
        await writeTenantNotification(target.id, {
          title: 'Workspace Re-Enabled',
          message: restoreMsg,
          category: 'system',
          severity: 'info',
          actionRoute: '/',
          channel: 'all',
        }).catch(() => {});
        if (target.ownerEmail) {
          await sendTransactionalEmail({
            to: target.ownerEmail,
            subject: `Workspace Re-Enabled — ${target.name}`,
            text: restoreMsg,
            html: buildSubscriptionEmailHtml({
              businessName: target.name,
              headline: 'Workspace Access Restored',
              message: restoreMsg,
              actionLabel: 'Open Workspace',
            }),
          }).catch(() => {});
        }
        toast.success(`${target.name} has been unlocked & re-enabled`);
      }
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `tenants/${target.id}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to update organization status');
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const updateOrgSubscription = async (
    target: Tenant,
    updates: {
      plan: Tenant['plan'];
      subscribedAt?: string;
      subscriptionEndsAt?: string;
      customPriceUgx?: number | null;
      isComplimentary?: boolean;
      autoRemindersEnabled?: boolean;
    }
  ): Promise<boolean> => {
    if (!user || !isMasterAdmin || isActing) return false;
    setIsActing(true);
    try {
      const payload: Record<string, unknown> = {
        plan: updates.plan,
        ...(updates.subscribedAt ? { subscribedAt: updates.subscribedAt } : {}),
        ...(updates.subscriptionEndsAt
          ? { subscriptionEndsAt: updates.subscriptionEndsAt }
          : { subscriptionEndsAt: deleteField() }),
        ...(updates.isComplimentary !== undefined ? { isComplimentary: updates.isComplimentary } : {}),
        ...(updates.autoRemindersEnabled !== undefined
          ? { autoRemindersEnabled: updates.autoRemindersEnabled }
          : {}),
        ...(updates.customPriceUgx !== undefined && updates.customPriceUgx !== null
          ? { customPriceUgx: updates.customPriceUgx }
          : { customPriceUgx: deleteField() }),
      };
      if (!updates.isComplimentary) {
        payload.complimentaryNote = deleteField();
      }
      await updateDoc(doc(db, 'tenants', target.id), payload);
      toast.success(`Updated subscription settings for ${target.name}`);
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `tenants/${target.id}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to update organization subscription');
      return false;
    } finally {
      setIsActing(false);
    }
  };

  const sendSubscriptionReminder = async (
    target: Tenant,
    params: { message: string; channel: 'in_app' | 'email' | 'whatsapp' | 'all' }
  ): Promise<{ ok: boolean; emailSent?: boolean; whatsappSent?: boolean; fallbackWhatsappUrl?: string }> => {
    if (!user || !isMasterAdmin || isActing) return { ok: false };
    const cleanMsg = params.message.trim();
    if (!cleanMsg) {
      toast.error('Enter a reminder message first');
      return { ok: false };
    }
    setIsActing(true);
    const nowIso = new Date().toISOString();
    const reminderId = crypto.randomUUID();
    const mappedChannel: SubscriptionReminder['channel'] =
      params.channel === 'all' ? 'email' : params.channel;

    try {
      const reminderDoc: SubscriptionReminder = stripUndefined({
        id: reminderId,
        tenantId: target.id,
        message: cleanMsg.slice(0, 500),
        channel: mappedChannel,
        sentBy: user.uid,
        sentByEmail: user.email,
        acknowledged: false,
        createdAt: nowIso,
      });

      await setDoc(doc(db, `tenants/${target.id}/reminders`, reminderId), reminderDoc);
      await writeTenantNotification(target.id, {
        title: 'Subscription Reminder',
        message: cleanMsg.slice(0, 500),
        category: 'billing',
        severity: 'warning',
        actionRoute: '/billing',
        channel: params.channel,
      });
      await updateDoc(doc(db, 'tenants', target.id), {
        lastReminderAt: nowIso,
        lastReminderMessage: cleanMsg.slice(0, 500),
        lastReminderChannel: params.channel,
      });

      let emailSent = false;
      let emailError: string | undefined;
      let whatsappSent = false;
      let fallbackWhatsappUrl: string | undefined;

      if ((params.channel === 'email' || params.channel === 'all') && target.ownerEmail) {
        const quota = getPlanQuota(target.plan);
        const fee =
          typeof target.customPriceUgx === 'number'
            ? target.customPriceUgx
            : quota.monthlyPriceUgx;
        const res = await sendTransactionalEmail({
          to: target.ownerEmail,
          subject: `Subscription Reminder — ${target.name} (${quota.name})`,
          text: cleanMsg,
          html: buildSubscriptionEmailHtml({
            businessName: target.name,
            headline: 'Subscription Renewal Reminder',
            message: cleanMsg,
            planLabel: `${quota.name} (${formatUGX(fee)}/month)`,
            expiryLabel: target.subscriptionEndsAt
              ? formatDate(target.subscriptionEndsAt)
              : target.trialEndsAt
              ? formatDate(target.trialEndsAt)
              : undefined,
          }),
        });
        emailSent = res.sent;
        emailError = res.error;
      }

      if (params.channel === 'whatsapp' || params.channel === 'all') {
        const phone = target.ownerPhone || target.pendingPayerPhone;
        const waRes = await sendWhatsAppReminder({ toPhone: phone, message: cleanMsg });
        whatsappSent = waRes.sent;
        if (!waRes.sent) fallbackWhatsappUrl = waRes.fallbackUrl;
      }

      if (emailSent && whatsappSent) {
        toast.success(`In-app, Email, and WhatsApp reminder sent to ${target.name}`);
      } else if (emailSent) {
        toast.success(`In-app + Email delivered to ${target.ownerEmail}`);
      } else if (emailError && (params.channel === 'email' || params.channel === 'all')) {
        toast.success(`In-app reminder delivered (${emailError})`);
      } else {
        toast.success(`Reminder delivered to ${target.name}'s workspace`);
      }

      return { ok: true, emailSent, whatsappSent, fallbackWhatsappUrl };
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `tenants/${target.id}/reminders/${reminderId}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to send reminder');
      return { ok: false };
    } finally {
      setIsActing(false);
    }
  };

  const runSubscriptionSweep = async (): Promise<SweepReport> => {
    const empty: SweepReport = {
      checkedCount: 0,
      lockedCount: 0,
      remindedCount: 0,
      emailedCount: 0,
      whatsappLinks: [],
    };
    if (!user || !isMasterAdmin || isActing) return empty;
    setIsActing(true);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let lockedCount = 0;
    let remindedCount = 0;
    let emailedCount = 0;
    const whatsappLinks: Array<{ tenantName: string; url: string }> = [];

    try {
      for (const org of organizations) {
        if (org.isComplimentary || org.autoRemindersEnabled === false) continue;

        const state = computeTrialState(org, nowMs);
        const quota = getPlanQuota(org.plan);
        const fee =
          typeof org.customPriceUgx === 'number' ? org.customPriceUgx : quota.monthlyPriceUgx;
        const expiryStr = state.effectiveEndsAt
          ? formatDate(state.effectiveEndsAt.toISOString())
          : 'today';

        const recentlyAutoReminded =
          org.lastAutoReminderAt &&
          nowMs - new Date(org.lastAutoReminderAt).getTime() < 24 * 60 * 60 * 1000;

        // 1. Expired unpaid workspace -> auto lock & send expired notice
        if (state.isExpired && !state.isPendingApproval && (!org.locked || org.status !== 'suspended')) {
          const msg = `Your ${quota.name} subscription (${formatUGX(
            fee
          )}/month) expired on ${expiryStr} and has been locked. Renew via MTN MoMo or Airtel Money in Billing to unlock your workspace.`;

          await updateDoc(doc(db, 'tenants', org.id), {
            locked: true,
            status: 'suspended',
            disabledReason: 'Monthly subscription expired — renew in Billing to restore access.',
            lastReminderAt: nowIso,
            lastReminderMessage: msg,
            lastReminderChannel: 'all',
            lastAutoReminderAt: nowIso,
          });
          await writeTenantNotification(org.id, {
            title: 'Subscription Expired — Workspace Locked',
            message: msg,
            category: 'billing',
            severity: 'critical',
            actionRoute: '/billing',
            channel: 'all',
          });

          lockedCount += 1;
          remindedCount += 1;

          if (org.ownerEmail) {
            const eRes = await sendTransactionalEmail({
              to: org.ownerEmail,
              subject: `Workspace Locked: Subscription Expired — ${org.name}`,
              text: msg,
              html: buildSubscriptionEmailHtml({
                businessName: org.name,
                headline: 'Monthly Subscription Expired',
                message: msg,
                planLabel: `${quota.name} (${formatUGX(fee)}/month)`,
                expiryLabel: expiryStr,
              }),
            });
            if (eRes.sent) emailedCount += 1;
          }

          const waRes = await sendWhatsAppReminder({
            toPhone: org.ownerPhone || org.pendingPayerPhone,
            message: msg,
          });
          if (!waRes.sent) {
            whatsappLinks.push({ tenantName: org.name, url: waRes.fallbackUrl });
          }
          continue;
        }

        // 2. Expiring within 3 days -> send automated pre-expiry reminder
        if (
          !state.isExpired &&
          state.effectiveEndsAt &&
          state.daysRemaining <= 3 &&
          !recentlyAutoReminded
        ) {
          const msg = `Reminder: ${org.name}'s ${quota.name} plan (${formatUGX(
            fee
          )}/month) expires in ${state.daysRemaining} day${
            state.daysRemaining === 1 ? '' : 's'
          } (${expiryStr}). Renew early in Billing to keep POS & Inventory uninterrupted.`;

          await updateDoc(doc(db, 'tenants', org.id), {
            lastReminderAt: nowIso,
            lastReminderMessage: msg,
            lastReminderChannel: 'all',
            lastAutoReminderAt: nowIso,
          });
          await writeTenantNotification(org.id, {
            title: `Renewal Due in ${state.daysRemaining} Day${state.daysRemaining === 1 ? '' : 's'}`,
            message: msg,
            category: 'billing',
            severity: 'warning',
            actionRoute: '/billing',
            channel: 'all',
          });
          remindedCount += 1;

          if (org.ownerEmail) {
            const eRes = await sendTransactionalEmail({
              to: org.ownerEmail,
              subject: `Renewal Reminder (${state.daysRemaining}d left) — ${org.name}`,
              text: msg,
              html: buildSubscriptionEmailHtml({
                businessName: org.name,
                headline: `Renewal Due in ${state.daysRemaining} Day${
                  state.daysRemaining === 1 ? '' : 's'
                }`,
                message: msg,
                planLabel: `${quota.name} (${formatUGX(fee)}/month)`,
                expiryLabel: expiryStr,
              }),
            });
            if (eRes.sent) emailedCount += 1;
          }

          const waRes = await sendWhatsAppReminder({
            toPhone: org.ownerPhone || org.pendingPayerPhone,
            message: msg,
          });
          if (!waRes.sent) {
            whatsappLinks.push({ tenantName: org.name, url: waRes.fallbackUrl });
          }
        }
      }

      toast.success(
        `Sweep checked ${organizations.length} orgs: ${lockedCount} locked, ${remindedCount} reminded, ${emailedCount} emails sent`
      );
      return {
        checkedCount: organizations.length,
        lockedCount,
        remindedCount,
        emailedCount,
        whatsappLinks,
      };
    } catch (error) {
      console.error('Sweep error:', error);
      toast.error('Subscription sweep encountered an error');
      return empty;
    } finally {
      setIsActing(false);
    }
  };

  const inspectOrganizationDetails = async (tenantId: string): Promise<OrgDetailsSnapshot> => {
    const [branchesSnap, membersSnap, billingSnap, remindersSnap] = await Promise.all([
      getDocs(collection(db, `tenants/${tenantId}/branches`)),
      getDocs(collection(db, `tenants/${tenantId}/members`)),
      getDocs(query(collection(db, `tenants/${tenantId}/billingHistory`), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, `tenants/${tenantId}/reminders`), orderBy('createdAt', 'desc'))),
    ]);

    return {
      branches: branchesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)),
      members: membersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as TenantMember)),
      billingHistory: billingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BillingHistory)),
      reminders: remindersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SubscriptionReminder)),
    };
  };

  return {
    organizations,
    isLoading,
    isActing,
    approveSubscription,
    rejectSubscription,
    grantComplimentaryAccess,
    toggleDisableOrganization,
    updateOrgSubscription,
    sendSubscriptionReminder,
    runSubscriptionSweep,
    inspectOrganizationDetails,
  };
}
