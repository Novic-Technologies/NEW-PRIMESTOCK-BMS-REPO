import { useEffect, useState, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { RegisterShift, SplitPaymentPart } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { logWorkspaceAudit } from './useAuditLog';
import { hasSectionAccess } from '../utils/rbac';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import toast from 'react-hot-toast';

export function useShifts() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [shifts, setShifts] = useState<RegisterShift[]>(
    () => getHookCache<RegisterShift[]>('shifts', tenant?.id) ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => (tenant?.id ? !hasHookCache('shifts', tenant.id) : false)
  );

  useEffect(() => {
    if (!tenant) {
      setShifts([]);
      setIsLoading(false);
      return;
    }

    setShifts(getHookCache<RegisterShift[]>('shifts', tenant.id) ?? []);
    setIsLoading(!hasHookCache('shifts', tenant.id));
    const sub = liveQuery(() =>
      localDb.shifts.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
        setHookCache('shifts', tenant.id, sorted);
        setShifts(sorted);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Fetch shifts error:', err);
        setIsLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, [tenant?.id]);

  const activeShift = useMemo(() => {
    const openShifts = shifts.filter((s) => s.status === 'open');
    if (activeBranchId && activeBranchId !== 'ALL') {
      return openShifts.find((s) => s.branchId === activeBranchId) || openShifts[0] || null;
    }
    return openShifts[0] || null;
  }, [shifts, activeBranchId]);

  const persistShift = async (shift: RegisterShift, action: 'create' | 'update') => {
    if (!tenant) return;
    const cleaned = stripUndefined(shift);
    await localDb.shifts.put(cleaned);

    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/shifts/${cleaned.id}`;
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/shifts`, cleaned.id), cleaned);
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'shifts',
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
        table: 'shifts',
        action,
        data: cleaned,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
  };

  const openShift = async (openingFloat: number) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!hasSectionAccess(user, 'shifts') && !hasSectionAccess(user, 'pos')) {
      toast.error('You do not have permission to open register shifts');
      return;
    }
    if (activeShift) {
      toast.error('A shift is already open. Close the current shift first.');
      return activeShift;
    }
    const cleanFloat = Math.max(0, Number(openingFloat) || 0);
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;
    const shift: RegisterShift = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      userId: user.uid,
      userName: user.name,
      openingFloat: cleanFloat,
      expectedCash: cleanFloat,
      cashSales: 0,
      mobileMoneySales: 0,
      cardSales: 0,
      creditSales: 0,
      salesCount: 0,
      status: 'open',
      openedAt: new Date().toISOString(),
    });

    await persistShift(shift, 'create');
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SHIFT_OPENED',
      entityType: 'shift',
      entityId: shift.id,
      summary: `Opened register shift with UGX ${cleanFloat.toLocaleString()} opening float`,
    });
    toast.success('Register shift opened');
    return shift;
  };

  const recordSaleOnShift = async (
    shiftId: string,
    paymentMethod: string,
    amount: number,
    splitPayments?: SplitPaymentPart[]
  ) => {
    const shift = await localDb.shifts.get(shiftId);
    if (!shift || shift.status !== 'open') return;

    const parts: SplitPaymentPart[] =
      splitPayments && splitPayments.length > 0
        ? splitPayments
        : [{ method: paymentMethod, amount }];

    let addCash = 0;
    let addMomo = 0;
    let addCredit = 0;
    let addCard = 0;

    for (const part of parts) {
      const m = part.method.toLowerCase();
      if (m.includes('cash')) addCash += part.amount;
      else if (m.includes('mtn') || m.includes('airtel') || m.includes('mobile')) addMomo += part.amount;
      else if (m.includes('credit')) addCredit += part.amount;
      else addCard += part.amount;
    }

    const updated: RegisterShift = stripUndefined({
      ...shift,
      cashSales: (shift.cashSales || 0) + addCash,
      mobileMoneySales: (shift.mobileMoneySales || 0) + addMomo,
      creditSales: (shift.creditSales || 0) + addCredit,
      cardSales: (shift.cardSales || 0) + addCard,
      expectedCash: (shift.expectedCash || shift.openingFloat) + addCash,
      salesCount: (shift.salesCount || 0) + 1,
    });

    await persistShift(updated, 'update');
  };

  const closeShift = async (shiftId: string, closingCash: number, notes?: string) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (
      !hasSectionAccess(user, 'shifts') &&
      !hasSectionAccess(user, 'pos') &&
      !['admin', 'manager'].includes(user.role)
    ) {
      toast.error('You do not have permission to close register shifts');
      return;
    }
    const shift = await localDb.shifts.get(shiftId);
    if (!shift) return;

    const counted = Math.max(0, Number(closingCash) || 0);
    const expected = shift.expectedCash ?? shift.openingFloat + (shift.cashSales || 0);
    const variance = counted - expected;

    const updated: RegisterShift = stripUndefined({
      ...shift,
      closingCash: counted,
      expectedCash: expected,
      variance,
      notes: notes?.trim() || undefined,
      status: 'closed',
      closedAt: new Date().toISOString(),
    });

    await persistShift(updated, 'update');
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: shift.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SHIFT_CLOSED',
      entityType: 'shift',
      entityId: shift.id,
      summary: `Closed register shift (Counted UGX ${counted.toLocaleString()}, Variance ${variance >= 0 ? '+' : ''}${variance.toLocaleString()})`,
    });
    toast.success('Shift closed and reconciled');
    return updated;
  };

  return {
    shifts,
    activeShift,
    isLoading,
    openShift,
    recordSaleOnShift,
    closeShift,
  };
}
