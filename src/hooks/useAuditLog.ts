import { useEffect, useState, useCallback } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { AuditLog } from '../types';
import { stripUndefined } from '../utils/firestoreUtils';

export async function logWorkspaceAudit(params: {
  tenantId: string;
  branchId?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
}): Promise<void> {
  const entry: AuditLog = stripUndefined({
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    branchId: params.branchId || undefined,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId || undefined,
    summary: params.summary.slice(0, 295),
    createdAt: new Date().toISOString(),
  });

  try {
    await localDb.auditLogs.put(entry);
    if (navigator.onLine) {
      try {
        await setDoc(doc(db, `tenants/${params.tenantId}/auditLogs`, entry.id), entry);
      } catch {
        await localDb.syncQueue.add({
          tenantId: params.tenantId,
          table: 'auditLogs',
          action: 'create',
          data: entry,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: params.tenantId,
        table: 'auditLogs',
        action: 'create',
        data: entry,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('Audit log write skipped:', err);
  }
}

export function useAuditLog() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const sub = liveQuery(() =>
      localDb.auditLogs.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setLogs(sorted);
        setIsLoading(false);
      },
      error: () => setIsLoading(false),
    });

    return () => sub.unsubscribe();
  }, [tenant?.id]);

  const recordAudit = useCallback(
    async (action: string, entityType: string, summary: string, entityId?: string) => {
      if (!tenant || !user) return;
      await logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: activeBranchId || user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action,
        entityType,
        entityId,
        summary,
      });
    },
    [tenant, user, activeBranchId]
  );

  return { logs, isLoading, recordAudit };
}
