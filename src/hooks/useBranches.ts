import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { Branch } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { getEffectivePlanQuota, isQuotaExceeded } from '../utils/planLimits';
import { logWorkspaceAudit } from './useAuditLog';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import toast from 'react-hot-toast';

export function useBranches() {
  const { tenant, user, activeBranchId, setActiveBranchId } = useAuthStore();
  const [branches, setBranches] = useState<Branch[]>(
    () => getHookCache<Branch[]>('branches', tenant?.id) ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => (tenant?.id ? !hasHookCache('branches', tenant.id) : false)
  );

  useEffect(() => {
    if (!tenant) {
      setBranches([]);
      setIsLoading(false);
      return;
    }

    setBranches(getHookCache<Branch[]>('branches', tenant.id) ?? []);
    setIsLoading(!hasHookCache('branches', tenant.id));
    const sub = liveQuery(() =>
      localDb.branches.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return a.createdAt.localeCompare(b.createdAt);
        });
        setHookCache('branches', tenant.id, sorted);
        setBranches(sorted);
        setIsLoading(false);

        if (
          sorted.length > 0 &&
          activeBranchId !== 'ALL' &&
          (!activeBranchId || !sorted.some((b) => b.id === activeBranchId))
        ) {
          const defaultBranch = sorted.find((b) => b.isDefault) || sorted[0];
          setActiveBranchId(defaultBranch.id);
        }
      },
      error: (err) => {
        console.error('Fetch branches error:', err);
        setIsLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, [tenant?.id, activeBranchId, setActiveBranchId]);

  const addBranch = async (data: { name: string; location: string; phone?: string }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to add branches.');
      return;
    }
    if (!['admin', 'manager'].includes(user.role)) {
      toast.error('Only managers or admins can create branches');
      return;
    }
    const quota = getEffectivePlanQuota(tenant);
    if (isQuotaExceeded(branches.length, quota.maxBranches)) {
      toast.error(
        `${quota.name} plan allows up to ${quota.maxBranches} branch${
          quota.maxBranches === 1 ? '' : 'es'
        }. Upgrade in Billing for more branches.`
      );
      return;
    }

    if (!data.name.trim() || !data.location.trim()) {
      toast.error('Branch name and location are required');
      return;
    }

    const branch: Branch = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      name: data.name.trim(),
      location: data.location.trim(),
      phone: data.phone?.trim() || undefined,
      isDefault: branches.length === 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    await localDb.branches.put(branch);
    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/branches/${branch.id}`;
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/branches`, branch.id), branch);
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'branches',
          action: 'create',
          data: branch,
          status: 'pending',
          createdAt: Date.now(),
        });
        try {
          handleFirestoreError(error, OperationType.WRITE, path);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: tenant.id,
        table: 'branches',
        action: 'create',
        data: branch,
        status: 'pending',
        createdAt: Date.now(),
      });
    }

    void logWorkspaceAudit({
      tenantId: tenant.id,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'BRANCH_CREATED',
      entityType: 'branch',
      entityId: branch.id,
      summary: `Created branch "${branch.name}" (${branch.location})`,
    });

    toast.success(`Branch "${branch.name}" added`);
    return branch;
  };

  const updateBranch = async (branchId: string, updates: Partial<Branch>) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!['admin', 'manager'].includes(user.role)) {
      toast.error('Only managers or admins can update branches');
      return;
    }
    const existing = await localDb.branches.get(branchId);
    if (!existing) return;

    const updated: Branch = stripUndefined({ ...existing, ...updates });
    await localDb.branches.put(updated);

    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/branches/${branchId}`;
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/branches`, branchId), updated);
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'branches',
          action: 'update',
          data: updated,
          status: 'pending',
          createdAt: Date.now(),
        });
        try {
          handleFirestoreError(error, OperationType.UPDATE, path);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: tenant.id,
        table: 'branches',
        action: 'update',
        data: updated,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
    if (user) {
      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'BRANCH_UPDATED',
        entityType: 'branch',
        entityId: branchId,
        summary: `Updated branch "${updated.name}" (${updated.location})`,
      });
    }
    toast.success('Branch updated');
    return updated;
  };

  const deleteBranch = async (branchId: string) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('Only business admins can delete branches');
      return;
    }
    const target = branches.find((b) => b.id === branchId);
    if (target?.isDefault) {
      toast.error('Cannot delete the default branch');
      return;
    }

    await localDb.branches.delete(branchId);
    if (activeBranchId === branchId) {
      const fallback = branches.find((b) => b.id !== branchId);
      setActiveBranchId(fallback ? fallback.id : null);
    }

    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/branches/${branchId}`;
      try {
        await deleteDoc(doc(db, `tenants/${tenant.id}/branches`, branchId));
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'branches',
          action: 'delete',
          data: { id: branchId },
          status: 'pending',
          createdAt: Date.now(),
        });
        try {
          handleFirestoreError(error, OperationType.DELETE, path);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: tenant.id,
        table: 'branches',
        action: 'delete',
        data: { id: branchId },
        status: 'pending',
        createdAt: Date.now(),
      });
    }
    void logWorkspaceAudit({
      tenantId: tenant.id,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'BRANCH_DELETED',
      entityType: 'branch',
      entityId: branchId,
      summary: `Removed branch "${target?.name || branchId}"`,
    });
    toast.success('Branch removed');
  };

  const activeBranch =
    activeBranchId === 'ALL'
      ? null
      : branches.find((b) => b.id === activeBranchId) || branches[0] || null;

  return {
    branches,
    activeBranch,
    activeBranchId: activeBranchId === 'ALL' ? 'ALL' : activeBranch?.id || activeBranchId,
    setActiveBranchId,
    isLoading,
    addBranch,
    updateBranch,
    deleteBranch,
  };
}
