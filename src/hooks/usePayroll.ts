import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { Expense, PayrollEntry, PayrollRun } from '../types';
import { computeTrialState } from '../utils/trialUtils';
import { stripUndefined } from '../utils/firestoreUtils';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function usePayroll() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setRuns([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const sub = liveQuery(() =>
      localDb.payrollRuns.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        setRuns([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setIsLoading(false);
      },
      error: () => setIsLoading(false),
    });

    return () => sub.unsubscribe();
  }, [tenant?.id]);

  const processPayrollRun = async (params: {
    periodLabel: string;
    paymentMethod: string;
    entries: PayrollEntry[];
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (user.role !== 'admin' && user.role !== 'accountant') {
      toast.error('Only business admins or accountants can process payroll runs');
      return;
    }

    const activeEntries = params.entries.filter((e) => e.grossSalaryUgx > 0);
    if (activeEntries.length === 0) {
      toast.error('Set base salaries for at least one staff member before running payroll');
      return;
    }

    const totalGrossUgx = activeEntries.reduce((s, e) => s + e.grossSalaryUgx, 0);
    const totalPayeUgx = activeEntries.reduce((s, e) => s + e.payeTaxUgx, 0);
    const totalNssfEmployeeUgx = activeEntries.reduce((s, e) => s + e.nssfEmployeeUgx, 0);
    const totalNssfEmployerUgx = activeEntries.reduce((s, e) => s + e.nssfEmployerUgx, 0);
    const totalNetPayUgx = activeEntries.reduce((s, e) => s + e.netPayUgx, 0);

    const nowIso = new Date().toISOString();
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;

    const run: PayrollRun = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      periodLabel: params.periodLabel.trim(),
      paymentMethod: params.paymentMethod,
      entries: activeEntries,
      totalGrossUgx,
      totalPayeUgx,
      totalNssfEmployeeUgx,
      totalNssfEmployerUgx,
      totalNetPayUgx,
      processedBy: user.uid,
      processedByName: user.name,
      createdAt: nowIso,
    });

    const expense: Expense = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      category: 'Salaries',
      description: `Staff Payroll (${run.periodLabel}) — ${activeEntries.length} staff + 10% NSSF Employer`,
      amount: totalGrossUgx + totalNssfEmployerUgx,
      paymentMethod: params.paymentMethod,
      expenseDate: nowIso.split('T')[0],
      recordedBy: user.uid,
      createdAt: nowIso,
    });

    await Promise.all([localDb.payrollRuns.put(run), localDb.expenses.put(expense)]);

    const syncPair = [
      { table: 'payrollRuns' as const, record: run },
      { table: 'expenses' as const, record: expense },
    ];

    await Promise.all(
      syncPair.map(async (item) => {
        if (navigator.onLine) {
          try {
            await setDoc(doc(db, `tenants/${tenant.id}/${item.table}`, item.record.id), item.record);
          } catch {
            await localDb.syncQueue.add({
              tenantId: tenant.id,
              table: item.table,
              action: 'create',
              data: item.record,
              status: 'pending',
              createdAt: Date.now(),
            });
          }
        } else {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: item.table,
            action: 'create',
            data: item.record,
            status: 'pending',
            createdAt: Date.now(),
          });
        }
      })
    );

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'PAYROLL_PROCESSED',
      entityType: 'payrollRun',
      entityId: run.id,
      summary: `Processed ${run.periodLabel} payroll for ${activeEntries.length} staff (Gross UGX ${totalGrossUgx.toLocaleString()})`,
    });

    toast.success(`Payroll for ${run.periodLabel} processed and posted to Expenses`);
    return run;
  };

  return { runs, isLoading, processPayrollRun };
}
