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
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useExpenses() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const subscription = liveQuery(() =>
      localDb.expenses.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  return { expenses, isLoading, addExpense, deleteExpense };
}
