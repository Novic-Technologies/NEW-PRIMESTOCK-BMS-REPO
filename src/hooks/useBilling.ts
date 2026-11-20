import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { AppNotification, BillingHistory, BillingPaymentMethod, SubscriptionReminder, Tenant } from '../types';
import { verifyBillingPayment } from '../services/aiService';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { MASTER_ADMIN_EMAILS } from '../utils/masterAdmin';
import { formatUGX } from '../utils/format';
import { buildSubscriptionEmailHtml, sendTransactionalEmail } from '../services/notificationService';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useBilling() {
  const { tenant, user, setTenant } = useAuthStore();
  const [history, setHistory] = useState<BillingHistory[]>([]);
  const [reminders, setReminders] = useState<SubscriptionReminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!tenant) {
      setHistory([]);
      setReminders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const dexieSub = liveQuery(() =>
      localDb.billingHistory.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHistory(sorted);
        setIsLoading(false);
      },
    });

    const path = `tenants/${tenant.id}/billingHistory`;
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BillingHistory));
        if (data.length > 0) {
          await localDb.billingHistory.bulkPut(data);
        }
        setHistory(data);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (structuredErr) {
          console.error(structuredErr);
        }
      }
    );

    const remindersPath = `tenants/${tenant.id}/reminders`;
    const rq = query(collection(db, remindersPath), orderBy('createdAt', 'desc'));
    const unsubReminders = onSnapshot(
      rq,
      (snapshot) => {
        setReminders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SubscriptionReminder)));
      },
      (err) => {
        console.warn('Reminders watch skipped:', err);
      }
    );

    return () => {
      dexieSub.unsubscribe();
      unsubscribe();
      unsubReminders();
    };
  }, [tenant?.id]);

  const selectPlan = async (
    planKey: Tenant['plan'],
    planLabel: string,
    amountUgx: number,
    paymentDetails?: {
      paymentMethod: string;
      reference: string;
      transactionId?: string;
      provider?: string;
      payerPhone?: string;
    }
  ) => {
    if (!tenant || !user || isUpdating) return false;
    if (user.role !== 'admin') {
      toast.error('Only business admins can submit subscription payments');
      return false;
    }

    const paymentMethod = paymentDetails?.paymentMethod || 'MTN Mobile Money';
    const paymentRef =
      paymentDetails?.reference?.trim() ||
      `INV-${planLabel.toUpperCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-6)}`;

    setIsUpdating(true);

    const tenantPath = `tenants/${tenant.id}`;
    const invoiceId = crypto.randomUUID();
    const invoicePath = `tenants/${tenant.id}/billingHistory/${invoiceId}`;
    const nowIso = new Date().toISOString();

    try {
      const verification = await verifyBillingPayment({
        plan: planKey,
        amountUgx,
        paymentMethod,
        reference: paymentRef,
        transactionId: paymentDetails?.transactionId,
        provider: paymentDetails?.provider,
        payerPhone: paymentDetails?.payerPhone,
      });

      const finalRef = verification.reference || paymentRef;
      const invoice: BillingHistory = stripUndefined({
        id: invoiceId,
        tenantId: tenant.id,
        plan: planKey,
        amount: amountUgx,
        paymentMethod,
        ...(paymentDetails?.provider ? { provider: paymentDetails.provider } : {}),
        ...(paymentDetails?.payerPhone ? { payerPhone: paymentDetails.payerPhone } : {}),
        status: 'Pending Approval',
        reference: finalRef,
        createdAt: nowIso,
      });

      const trialState = computeTrialState(tenant);
      const shouldSetPendingStatus =
        trialState.isExpired ||
        tenant.status === 'suspended' ||
        tenant.status === 'pending_approval';
      const nextStatus: Tenant['status'] = shouldSetPendingStatus ? 'pending_approval' : tenant.status;

      const tenantUpdate: Record<string, unknown> = {
        pendingPlan: planKey,
        pendingAmountUgx: amountUgx,
        pendingPaymentMethod: paymentMethod,
        pendingPaymentRef: finalRef,
        pendingTransactionId: paymentDetails?.transactionId?.trim() || deleteField(),
        pendingPayerPhone: paymentDetails?.payerPhone?.trim() || deleteField(),
        pendingInvoiceId: invoiceId,
        pendingSubmittedAt: nowIso,
        ownerEmail: tenant.ownerEmail || user.email,
        ownerName: tenant.ownerName || user.name,
        ...(shouldSetPendingStatus ? { status: 'pending_approval' } : {}),
      };

      await setDoc(doc(db, `tenants/${tenant.id}/billingHistory`, invoiceId), invoice);
      await updateDoc(doc(db, 'tenants', tenant.id), tenantUpdate);
      await localDb.billingHistory.put(invoice);

      const nextTenant: Tenant = {
        ...tenant,
        status: nextStatus,
        pendingPlan: planKey,
        pendingAmountUgx: amountUgx,
        pendingPaymentMethod: paymentMethod,
        pendingPaymentRef: finalRef,
        pendingInvoiceId: invoiceId,
        pendingSubmittedAt: nowIso,
        ownerEmail: tenant.ownerEmail || user.email,
        ownerName: tenant.ownerName || user.name,
      };
      if (paymentDetails?.transactionId?.trim()) {
        nextTenant.pendingTransactionId = paymentDetails.transactionId.trim();
      } else {
        delete nextTenant.pendingTransactionId;
      }
      if (paymentDetails?.payerPhone?.trim()) {
        nextTenant.pendingPayerPhone = paymentDetails.payerPhone.trim();
      } else {
        delete nextTenant.pendingPayerPhone;
      }

      setTenant(nextTenant);

      const submittedMsg = `We received your ${planLabel} payment reference (${finalRef}) via ${paymentMethod} for ${formatUGX(
        amountUgx
      )}. Your subscription is queued for Master Admin verification.`;

      const submitNotif: AppNotification = {
        id: `pay_sub_${invoiceId.slice(0, 12)}`,
        tenantId: tenant.id,
        title: `Payment Submitted · ${planLabel}`,
        message: submittedMsg,
        category: 'billing',
        severity: 'info',
        read: false,
        actionRoute: '/billing',
        channel: 'all',
        createdAt: nowIso,
      };
      setDoc(doc(db, `tenants/${tenant.id}/notifications`, submitNotif.id), submitNotif).catch(() => {});

      const payerEmail = (tenant.ownerEmail || user.email || '').trim();
      if (payerEmail) {
        sendTransactionalEmail({
          to: payerEmail,
          subject: `Payment Received (Pending Approval) — ${tenant.name}`,
          text: submittedMsg,
          html: buildSubscriptionEmailHtml({
            businessName: tenant.name,
            headline: 'Subscription Payment Under Review',
            message: submittedMsg,
            planLabel: `${planLabel} (${formatUGX(amountUgx)}/month)`,
            actionLabel: 'View Billing Status',
          }),
        }).catch(() => {});
      }

      const masterAlertEmail = MASTER_ADMIN_EMAILS[0];
      if (masterAlertEmail && payerEmail.toLowerCase() !== masterAlertEmail.toLowerCase()) {
        sendTransactionalEmail({
          to: masterAlertEmail,
          subject: `Approval Required: ${tenant.name} paid ${formatUGX(amountUgx)} (${planLabel})`,
          text: `${tenant.name} (${payerEmail || user.name}) submitted a ${planLabel} payment of ${formatUGX(
            amountUgx
          )} via ${paymentMethod}.\nReference: ${finalRef}${
            paymentDetails?.payerPhone ? `\nPayer Phone: ${paymentDetails.payerPhone}` : ''
          }\n\nOpen Master Console to review and approve.`,
          html: buildSubscriptionEmailHtml({
            businessName: tenant.name,
            headline: 'New Subscription Payment Ready for Approval',
            message: `${tenant.name} submitted payment reference ${finalRef} via ${paymentMethod} for ${planLabel}. Review and unlock in the Master Console.`,
            planLabel: `${planLabel} (${formatUGX(amountUgx)})`,
            actionLabel: 'Open Master Console',
            actionUrl: typeof window !== 'undefined' ? `${window.location.origin}/master` : undefined,
          }),
        }).catch(() => {});
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PLAN_PAYMENT_SUBMITTED',
        entityType: 'billing',
        entityId: invoiceId,
        summary: `Submitted ${planLabel} payment via ${paymentMethod} (Ref: ${finalRef}) awaiting Master Admin approval`,
      });

      toast.success('Payment submitted! Awaiting Master Admin approval to activate your subscription.');
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to submit subscription payment';
      try {
        handleFirestoreError(error, OperationType.WRITE, `${tenantPath} | ${invoicePath}`);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error(errMsg);
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const savePaymentMethods = async (methods: BillingPaymentMethod[]) => {
    if (!tenant || !user || isUpdating) return false;
    if (user.role !== 'admin') {
      toast.error('Only business admins can update billing payment methods');
      return false;
    }
    setIsUpdating(true);

    const tenantPath = `tenants/${tenant.id}`;
    try {
      const cleaned = stripUndefined(methods);
      await updateDoc(doc(db, 'tenants', tenant.id), {
        billingPaymentMethods: cleaned,
      });
      setTenant({
        ...tenant,
        billingPaymentMethods: cleaned,
      });
      toast.success('Billing payment methods updated');
      return true;
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, tenantPath);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to update payment methods');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const acknowledgeReminder = async (reminderId?: string) => {
    if (!tenant) return;
    try {
      if (reminderId) {
        await updateDoc(doc(db, `tenants/${tenant.id}/reminders`, reminderId), {
          acknowledged: true,
        });
      }
    } catch (err) {
      console.warn('Could not acknowledge reminder:', err);
    }
  };

  return {
    history,
    reminders,
    isLoading,
    isUpdating,
    selectPlan,
    savePaymentMethods,
    acknowledgeReminder,
  };
}
