import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { localDb } from '../services/db';
import { Expense } from '../types';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { canManageFinanceData, hasSectionAccess } from '../utils/rbac';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useExpenses() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>(
    () => getHookCache<Expense[]>('expenses', tenant?.id) ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => (tenant?.id ? !hasHookCache('expenses', tenant.id) : false)
  );

  useEffect(() => {
    if (!tenant) {
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    setExpenses(getHookCache<Expense[]>('expenses', tenant.id) ?? []);
    setIsLoading(!hasHookCache('expenses', tenant.id));
    const subscription = liveQuery(() =>
      localDb.expenses.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHookCache('expenses', tenant.id, sorted);
        setExpenses(sorted);
        setIsLoading(false);
      },
      error: (error) => {
        console.error('Fetch expenses error:', error);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [tenant?.id]);

  const addExpense = async (
    expenseData: Omit<Expense, 'id' | 'tenantId' | 'recordedBy' | 'createdAt'>
  ) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to record expenses.');
      return;
    }
    if (!canManageFinanceData(user)) {
      toast.error('Only finance, accountant, or admin staff can record expenses');
      return;
    }
    if (!expenseData.description.trim() || Number(expenseData.amount) <= 0) {
      toast.error('Enter a description and an amount greater than 0');
      return;
    }

    const targetBranch =
      expenseData.branchId ||
      (activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined);

    const newExpense: Expense = stripUndefined({
      ...expenseData,
      branchId: targetBranch,
      description: expenseData.description.trim(),
      amount: Number(expenseData.amount),
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      recordedBy: user.uid,
      createdAt: new Date().toISOString(),
    });

    try {
      await localDb.expenses.put(newExpense);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/expenses/${newExpense.id}`;
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/expenses`, newExpense.id), stripUndefined(newExpense));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'expenses',
            action: 'create',
            data: newExpense,
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.WRITE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'expenses',
          action: 'create',
          data: newExpense,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: targetBranch,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'EXPENSE_RECORDED',
        entityType: 'expense',
        entityId: newExpense.id,
        summary: `Recorded ${newExpense.category} expense "${newExpense.description}" (UGX ${newExpense.amount.toLocaleString()})`,
      });

      toast.success('Expense recorded successfully');
      return newExpense;
    } catch (error) {
      console.error('Add expense error:', error);
      toast.error('Failed to record expense');
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('Only business admins can delete expense records');
      return;
    }
    try {
      const existing = expenses.find((e) => e.id === expenseId);
      await localDb.expenses.delete(expenseId);
      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/expenses/${expenseId}`;
        try {
          await deleteDoc(doc(db, `tenants/${tenant.id}/expenses`, expenseId));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'expenses',
            action: 'delete',
            data: { id: expenseId },
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.DELETE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'expenses',
          action: 'delete',
          data: { id: expenseId },
          status: 'pending',
          createdAt: Date.now(),
        });
      }
      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: existing?.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'EXPENSE_DELETED',
        entityType: 'expense',
        entityId: expenseId,
        summary: `Deleted expense "${existing?.description || expenseId}"${
          existing ? ` (UGX ${existing.amount.toLocaleString()})` : ''
        }`,
      });
      toast.success('Expense deleted');
    } catch (error) {
      console.error('Delete expense error:', error);
      toast.error('Failed to delete expense');
    }
  };

  const bulkImportExpenses = async (
    rows: Array<{
      expenseDate?: string;
      category?: string;
      description: string;
      amount: number;
      paymentMethod?: string;
    }>
  ): Promise<number> => {
    if (!tenant || !user) return 0;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to record expenses.');
      return 0;
    }
    if (!canManageFinanceData(user) && !hasSectionAccess(user, 'bulk_import')) {
      toast.error('You do not have permission to import expenses');
      return 0;
    }

    const targetBranch =
      activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];

    const toCreate: Expense[] = rows
      .filter((r) => String(r.description || '').trim().length > 0 && Number(r.amount) > 0)
      .map((r) =>
        stripUndefined({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          branchId: targetBranch,
          category: String(r.category || 'General').trim().slice(0, 80) || 'General',
          description: String(r.description).trim().slice(0, 300),
          amount: Math.max(1, Math.round(Number(r.amount))),
          paymentMethod: String(r.paymentMethod || 'Cash').trim().slice(0, 64) || 'Cash',
          expenseDate: String(r.expenseDate || todayDate).trim().slice(0, 64) || todayDate,
          recordedBy: user.uid,
          createdAt: nowIso,
        })
      );

    if (toCreate.length === 0) {
      toast.error('No valid expense rows found (description and amount > 0 required).');
      return 0;
    }

    await localDb.expenses.bulkPut(toCreate);
    if (navigator.onLine) {
      const CHUNK_SIZE = 12;
      for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
        const chunk = toCreate.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (expense) => {
            try {
              await setDoc(doc(db, `tenants/${tenant.id}/expenses`, expense.id), expense);
            } catch {
              await localDb.syncQueue.add({
                tenantId: tenant.id,
                table: 'expenses',
                action: 'create',
                data: expense,
                status: 'pending',
                createdAt: Date.now(),
              });
            }
          })
        );
      }
    } else {
      await localDb.syncQueue.bulkAdd(
        toCreate.map((expense) => ({
          tenantId: tenant.id,
          table: 'expenses' as const,
          action: 'create' as const,
          data: expense,
          status: 'pending' as const,
          createdAt: Date.now(),
        }))
      );
    }

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'EXPENSE_BULK_IMPORT',
      entityType: 'expense',
      summary: `Imported ${toCreate.length} expense record(s) via Smart Import`,
    });

    toast.success(`Imported ${toCreate.length} expense record${toCreate.length === 1 ? '' : 's'}`);
    return toCreate.length;
  };

  return { expenses, isLoading, addExpense, bulkImportExpenses, deleteExpense };
}
