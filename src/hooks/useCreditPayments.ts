import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { CreditPayment, Expense } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { logWorkspaceAudit } from './useAuditLog';
import { canManageFinanceData, canManageInventoryData, hasSectionAccess } from '../utils/rbac';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import toast from 'react-hot-toast';

export function useCreditPayments() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [payments, setPayments] = useState<CreditPayment[]>(
    () => getHookCache<CreditPayment[]>('creditPayments', tenant?.id) ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => (tenant?.id ? !hasHookCache('creditPayments', tenant.id) : false)
  );

  useEffect(() => {
    if (!tenant) {
      setPayments([]);
      setIsLoading(false);
      return;
    }

    setPayments(getHookCache<CreditPayment[]>('creditPayments', tenant.id) ?? []);
    setIsLoading(!hasHookCache('creditPayments', tenant.id));
    const sub = liveQuery(() =>
      localDb.creditPayments.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHookCache('creditPayments', tenant.id, sorted);
        setPayments(sorted);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Fetch credit payments error:', err);
        setIsLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, [tenant?.id]);

  const persist = async (
    table: 'creditPayments' | 'customers' | 'suppliers' | 'expenses',
    action: 'create' | 'update',
    record: any
  ) => {
    if (!tenant) return;
    const cleaned = stripUndefined(record);
    await localDb.table<any, string>(table).put(cleaned);

    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/${table}/${cleaned.id}`;
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/${table}`, cleaned.id), cleaned);
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table,
          action,
          data: cleaned,
          status: 'pending',
          createdAt: Date.now(),
        });
        try {
          handleFirestoreError(
            error,
            action === 'create' ? OperationType.CREATE : OperationType.UPDATE,
            path
          );
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: tenant.id,
        table,
        action,
        data: cleaned,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
  };

  const recordCustomerRepayment = async (params: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (
      !hasSectionAccess(user, 'customers') &&
      !hasSectionAccess(user, 'pos') &&
      !hasSectionAccess(user, 'sales') &&
      !canManageFinanceData(user)
    ) {
      toast.error('You do not have permission to record customer repayments');
      return;
    }
    const customer = await localDb.customers.get(params.customerId);
    if (!customer) return;

    const cleanAmount = Math.max(0, Number(params.amount) || 0);
    if (cleanAmount <= 0) {
      toast.error('Repayment amount must be greater than 0');
      return;
    }

    const applied = Math.min(cleanAmount, Math.max(0, customer.currentBalance || 0));
    if (applied <= 0) {
      toast.error('This customer has no outstanding credit balance');
      return;
    }

    const entry: CreditPayment = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      partyType: 'customer',
      partyId: customer.id,
      partyName: customer.name,
      amount: applied,
      paymentMethod: params.paymentMethod,
      reference: params.reference?.trim() || `CR-${Date.now().toString().slice(-6)}`,
      notes: params.notes?.trim() || undefined,
      recordedBy: user.uid,
      createdAt: new Date().toISOString(),
    });

    await persist('customers', 'update', {
      ...customer,
      currentBalance: Math.max(0, (customer.currentBalance || 0) - applied),
    });
    await persist('creditPayments', 'create', entry);
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'CREDIT_REPAYMENT_RECORDED',
      entityType: 'creditPayment',
      entityId: entry.id,
      summary: `Recorded customer repayment from ${customer.name} (UGX ${applied.toLocaleString()} via ${params.paymentMethod})`,
    });
    toast.success(`Recorded repayment from ${customer.name}`);
    return entry;
  };

  const recordSupplierPayment = async (params: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (
      !canManageInventoryData(user) &&
      !hasSectionAccess(user, 'suppliers') &&
      !canManageFinanceData(user)
    ) {
      toast.error('You do not have permission to record supplier payments');
      return;
    }
    const supplier = await localDb.suppliers.get(params.supplierId);
    if (!supplier) return;

    const cleanAmount = Math.max(0, Number(params.amount) || 0);
    if (cleanAmount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }

    const currentBal = supplier.currentBalance || 0;
    const applied = currentBal > 0 ? Math.min(cleanAmount, currentBal) : cleanAmount;
    const nowIso = new Date().toISOString();
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;

    const entry: CreditPayment = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      partyType: 'supplier',
      partyId: supplier.id,
      partyName: supplier.name,
      amount: applied,
      paymentMethod: params.paymentMethod,
      reference: params.reference?.trim() || `SP-${Date.now().toString().slice(-6)}`,
      notes: params.notes?.trim() || undefined,
      recordedBy: user.uid,
      createdAt: nowIso,
    });

    await persist('suppliers', 'update', {
      ...supplier,
      currentBalance: Math.max(0, currentBal - applied),
    });

    const expense: Expense = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      category: 'Supplies',
      description: `Supplier Payable Settlement (${supplier.name})`,
      amount: applied,
      paymentMethod: params.paymentMethod,
      expenseDate: nowIso.split('T')[0],
      recordedBy: user.uid,
      createdAt: nowIso,
    });

    await persist('expenses', 'create', expense);
    await persist('creditPayments', 'create', entry);
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SUPPLIER_PAYMENT_RECORDED',
      entityType: 'creditPayment',
      entityId: entry.id,
      summary: `Paid supplier ${supplier.name} UGX ${applied.toLocaleString()} via ${params.paymentMethod}`,
    });
    toast.success(`Recorded payment to ${supplier.name}`);
    return entry;
  };

  return {
    payments,
    isLoading,
    recordCustomerRepayment,
    recordSupplierPayment,
  };
}
