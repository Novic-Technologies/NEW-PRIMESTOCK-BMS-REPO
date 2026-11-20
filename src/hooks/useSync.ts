import { useEffect, useCallback, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { localDb } from '../services/db';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { SyncTable, Tenant } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { getUserAllowedSections } from '../utils/rbac';
import toast from 'react-hot-toast';

let queueFlushInFlight = false;

export async function flushSyncQueue(tenantId: string): Promise<void> {
  if (!navigator.onLine || !tenantId || queueFlushInFlight) return;
  queueFlushInFlight = true;

  const { setStatus, setLastSyncedAt } = useSyncStore.getState();

  try {
    const allPending = await localDb.syncQueue.where('status').equals('pending').toArray();
    const pendingRecords = allPending.filter((r) => !r.tenantId || r.tenantId === tenantId);
    if (pendingRecords.length === 0) {
      setStatus('synced');
      return;
    }

    setStatus('syncing');

    const BATCH_SIZE = 10;
    for (let i = 0; i < pendingRecords.length; i += BATCH_SIZE) {
      const chunk = pendingRecords.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        chunk.map(async (record) => {
          if (record.tenantId && record.tenantId !== tenantId) return;
          const { table, action, data } = record;
          if (!data?.id) {
            if (record.id !== undefined) {
              await localDb.syncQueue.delete(record.id);
            }
            return;
          }

          const colPath = `tenants/${tenantId}/${table}`;
          const docPath = `${colPath}/${data.id}`;

          try {
            if (action === 'delete') {
              await deleteDoc(doc(db, colPath, data.id));
            } else {
              await setDoc(doc(db, colPath, data.id), stripUndefined(data));
            }
            if (record.id !== undefined) {
              await localDb.syncQueue.delete(record.id);
            }
          } catch (error) {
            try {
              handleFirestoreError(
                error,
                action === 'delete' ? OperationType.DELETE : OperationType.WRITE,
                docPath
              );
            } catch (structuredErr) {
              console.error(structuredErr);
            }
            if (record.id !== undefined) {
              await localDb.syncQueue.update(record.id, { status: 'error' });
            }
            setStatus('error');
          }
        })
      );
    }

    setLastSyncedAt(Date.now());
    const remainingErrors = await localDb.syncQueue
      .where('status')
      .equals('error')
      .filter((r) => !r.tenantId || r.tenantId === tenantId)
      .count();
    setStatus(remainingErrors > 0 ? 'error' : 'synced');
  } finally {
    queueFlushInFlight = false;
  }
}

export function useSync() {
  const { isOnline, setOnline, setPendingCount, setStatus, setLastSyncedAt } = useSyncStore();
  const { tenant, user, setTenant } = useAuthStore();

  const sectionsKey = useMemo(() => {
    if (!user) return '';
    return getUserAllowedSections(user).join(',');
  }, [user?.role, user?.allowedSections]);

  const activeCollections = useMemo<SyncTable[]>(() => {
    if (!user) return [];
    const sections = new Set(sectionsKey ? sectionsKey.split(',') : []);
    const tables = new Set<SyncTable>(['branches']);

    if (user.role === 'admin') {
      return [
        'products',
        'sales',
        'customers',
        'expenses',
        'suppliers',
        'branches',
        'shifts',
        'purchaseOrders',
        'creditPayments',
        'billingHistory',
        'stockTransfers',
        'stockAdjustments',
        'payrollRuns',
        'auditLogs',
        'aiChats',
      ];
    }

    if (sections.has('dashboard')) {
      tables.add('products');
      tables.add('sales');
      tables.add('customers');
      tables.add('expenses');
    }
    if (sections.has('pos')) {
      tables.add('products');
      tables.add('sales');
      tables.add('customers');
      tables.add('shifts');
    }
    if (sections.has('sales')) {
      tables.add('sales');
      tables.add('customers');
      tables.add('products');
    }
    if (sections.has('inventory')) {
      tables.add('products');
      tables.add('stockTransfers');
      tables.add('stockAdjustments');
    }
    if (sections.has('purchases')) {
      tables.add('purchaseOrders');
      tables.add('suppliers');
      tables.add('products');
    }
    if (sections.has('customers')) {
      tables.add('customers');
      tables.add('creditPayments');
      tables.add('sales');
    }
    if (sections.has('suppliers')) {
      tables.add('suppliers');
      tables.add('creditPayments');
      tables.add('purchaseOrders');
    }
    if (sections.has('finance')) {
      tables.add('expenses');
      tables.add('sales');
    }
    if (sections.has('payroll')) {
      tables.add('payrollRuns');
    }
    if (sections.has('reports')) {
      tables.add('sales');
      tables.add('products');
      tables.add('expenses');
      tables.add('customers');
    }
    if (sections.has('shifts')) {
      tables.add('shifts');
      tables.add('sales');
    }
    if (user.role === 'manager' || user.role === 'accountant') {
      tables.add('auditLogs');
    }
    if (sections.has('ai')) {
      tables.add('aiChats');
      tables.add('products');
      tables.add('sales');
      tables.add('customers');
      tables.add('expenses');
    }
    if (sections.has('billing')) {
      tables.add('billingHistory');
    }

    return Array.from(tables);
  }, [user?.role, sectionsKey]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (tenant?.id) {
        void flushSyncQueue(tenant.id);
      }
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, tenant?.id]);

  // Single-pass concurrent Firestore listeners with batched Dexie bulkPut/bulkDelete
  useEffect(() => {
    if (!isOnline || !tenant?.id || activeCollections.length === 0) return;

    setStatus('syncing');
    const tenantId = tenant.id;
    let settledCount = 0;
    const totalListeners = activeCollections.length;
    const firstSnapshotDone = new Set<string>();

    const markListenerReady = (key: string) => {
      if (!firstSnapshotDone.has(key)) {
        firstSnapshotDone.add(key);
        settledCount++;
        if (settledCount >= totalListeners) {
          setLastSyncedAt(Date.now());
          setStatus('synced');
        }
      }
    };

    const unsubscribers = activeCollections.map((tableName) => {
      const path = `tenants/${tenantId}/${tableName}`;
      let reconciled = false;

      return onSnapshot(
        collection(db, path),
        async (snapshot) => {
          try {
            const dexieTable = localDb.table<any, string>(tableName);

            if (!reconciled) {
              reconciled = true;
              const queued = await localDb.syncQueue
                .where('status')
                .anyOf(['pending', 'error'])
                .filter((r) => (!r.tenantId || r.tenantId === tenantId) && r.table === tableName)
                .toArray();
              const queuedDeletes = new Set(
                queued.filter((q) => q.action === 'delete' && q.data?.id).map((q) => String(q.data.id))
              );
              const queuedUpserts = new Set(
                queued.filter((q) => q.action !== 'delete' && q.data?.id).map((q) => String(q.data.id))
              );

              const remoteItems = snapshot.docs
                .map((d) => d.data())
                .filter((d) => d?.id && !queuedDeletes.has(String(d.id)));
              const remoteIds = new Set(remoteItems.map((d) => String(d.id)));
              const localRows = await dexieTable.where('tenantId').equals(tenantId).toArray();
              const staleIds = localRows
                .map((r) => String(r.id))
                .filter((id) => !remoteIds.has(id) && !queuedUpserts.has(id));

              await localDb.transaction('rw', dexieTable, async () => {
                if (staleIds.length > 0) await dexieTable.bulkDelete(staleIds);
                if (remoteItems.length > 0) await dexieTable.bulkPut(remoteItems);
              });
            } else {
              const upserts: any[] = [];
              const deletes: string[] = [];
              for (const change of snapshot.docChanges()) {
                if (change.type === 'added' || change.type === 'modified') {
                  upserts.push(change.doc.data());
                } else if (change.type === 'removed') {
                  deletes.push(change.doc.id);
                }
              }
              if (upserts.length > 0 || deletes.length > 0) {
                await localDb.transaction('rw', dexieTable, async () => {
                  if (upserts.length > 0) await dexieTable.bulkPut(upserts);
                  if (deletes.length > 0) await dexieTable.bulkDelete(deletes);
                });
              }
            }
          } catch (err) {
            console.warn(`Sync update warning for ${tableName}:`, err);
          } finally {
            markListenerReady(tableName);
          }
        },
        (error) => {
          markListenerReady(tableName);
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch (structuredErr) {
            console.error(structuredErr);
          }
        }
      );
    });

    let membersReconciled = false;
    const unsubMembers = onSnapshot(
      collection(db, `tenants/${tenantId}/members`),
      async (snapshot) => {
        try {
          if (!membersReconciled) {
            membersReconciled = true;
            const memberItems = snapshot.docs.map((d) => d.data());
            const remoteUids = new Set(memberItems.map((m) => String(m.uid)));
            const localMembers = await localDb.members.where('tenantId').equals(tenantId).toArray();
            const staleUids = localMembers
              .map((m) => String(m.uid))
              .filter((uid) => !remoteUids.has(uid));
            await localDb.transaction('rw', localDb.members, async () => {
              if (staleUids.length > 0) await localDb.members.bulkDelete(staleUids);
              if (memberItems.length > 0) await localDb.members.bulkPut(memberItems as any);
            });
          } else {
            const upserts: any[] = [];
            const deletes: string[] = [];
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added' || change.type === 'modified') {
                upserts.push(change.doc.data());
              } else if (change.type === 'removed') {
                deletes.push(change.doc.id);
              }
            }
            if (upserts.length > 0 || deletes.length > 0) {
              await localDb.transaction('rw', localDb.members, async () => {
                if (upserts.length > 0) await localDb.members.bulkPut(upserts);
                if (deletes.length > 0) await localDb.members.bulkDelete(deletes);
              });
            }
          }
        } catch (err) {
          console.warn('Members sync warning:', err);
        }
      },
      (err) => console.warn('Members listener error:', err)
    );

    const tenantDocPath = `tenants/${tenantId}`;
    const unsubTenant = onSnapshot(
      doc(db, 'tenants', tenantId),
      (snap) => {
        if (snap.exists()) {
          setTenant(snap.data() as Tenant);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, tenantDocPath);
        } catch (structuredErr) {
          console.error(structuredErr);
        }
      }
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      unsubMembers();
      unsubTenant();
    };
  }, [isOnline, tenant?.id, user?.role, sectionsKey, activeCollections, setTenant, setStatus, setLastSyncedAt]);

  // Live pending sync queue counter scoped to tenant
  useEffect(() => {
    const subscription = liveQuery(() =>
      localDb.syncQueue
        .where('status')
        .anyOf(['pending', 'error'])
        .filter((r) => !tenant?.id || !r.tenantId || r.tenantId === tenant.id)
        .count()
    ).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error('Sync queue liveQuery error:', err),
    });

    return () => subscription.unsubscribe();
  }, [setPendingCount, tenant?.id]);

  const syncData = useCallback(async () => {
    if (!isOnline || !tenant) return;
    await localDb.syncQueue
      .where('status')
      .equals('error')
      .filter((r) => !r.tenantId || r.tenantId === tenant.id)
      .modify({ status: 'pending' });
    await flushSyncQueue(tenant.id);
    const remaining = await localDb.syncQueue
      .where('status')
      .anyOf(['pending', 'error'])
      .filter((r) => !r.tenantId || r.tenantId === tenant.id)
      .count();
    if (remaining === 0) {
      toast.success('All offline changes synced');
    }
  }, [isOnline, tenant]);

  useEffect(() => {
    if (isOnline && tenant?.id) {
      void flushSyncQueue(tenant.id);
    }
  }, [isOnline, tenant?.id]);

  return { syncData };
}
