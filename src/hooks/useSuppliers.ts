import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { localDb } from '../services/db';
import { Supplier } from '../types';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { canAccessFeature } from '../utils/planLimits';
import { canManageInventoryData, hasSectionAccess } from '../utils/rbac';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useSuppliers() {
  const { user, tenant } = useAuthStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>(
    () => getHookCache<Supplier[]>('suppliers', user?.tenantId) ?? []
  );
  const [loading, setLoading] = useState<boolean>(
    () => (user?.tenantId ? !hasHookCache('suppliers', user.tenantId) : false)
  );

  useEffect(() => {
    if (!user?.tenantId) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    setSuppliers(getHookCache<Supplier[]>('suppliers', user.tenantId) ?? []);
    setLoading(!hasHookCache('suppliers', user.tenantId));
    const subscription = liveQuery(() =>
      localDb.suppliers.where('tenantId').equals(user.tenantId).toArray()
    ).subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHookCache('suppliers', user.tenantId, sorted);
        setSuppliers(sorted);
        setLoading(false);
      },
      error: (error) => {
        console.error('Failed to load suppliers:', error);
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [user?.tenantId]);

  const addSupplier = async (supplierData: Omit<Supplier, 'id' | 'tenantId' | 'createdAt'>) => {
    if (!user?.tenantId) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Suppliers & Payables require Starter plan or higher. Upgrade in Billing.');
      return;
    }
    if (!canManageInventoryData(user) && !hasSectionAccess(user, 'suppliers')) {
      toast.error('You do not have permission to add suppliers');
      return;
    }
    const phone = (supplierData.phone || '').trim();
    if (phone.length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }

    const cleanEmail = supplierData.email?.trim().toLowerCase() || '';
    if (cleanEmail) {
      const tenantSuppliers = await localDb.suppliers.where('tenantId').equals(user.tenantId).toArray();
      if (tenantSuppliers.some((s) => (s.email || '').trim().toLowerCase() === cleanEmail)) {
        toast.error('This email address is already used by another supplier. Please enter a different email.');
        return;
      }
    }

    const newSupplier: Supplier = stripUndefined({
      ...supplierData,
      name: supplierData.name.trim(),
      phone,
      contactPerson: supplierData.contactPerson?.trim() || undefined,
      email: cleanEmail || undefined,
      address: supplierData.address?.trim() || undefined,
      id: crypto.randomUUID(),
      tenantId: user.tenantId,
      createdAt: new Date().toISOString(),
    });

    try {
      await localDb.suppliers.put(newSupplier);

      if (navigator.onLine) {
        const path = `tenants/${user.tenantId}/suppliers/${newSupplier.id}`;
        try {
          const supplierRef = doc(collection(db, 'tenants', user.tenantId, 'suppliers'), newSupplier.id);
          await setDoc(supplierRef, stripUndefined(newSupplier));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: user.tenantId,
            table: 'suppliers',
            action: 'create',
            data: newSupplier,
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
          tenantId: user.tenantId,
          table: 'suppliers',
          action: 'create',
          data: newSupplier,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: user.tenantId,
        branchId: user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'SUPPLIER_CREATED',
        entityType: 'supplier',
        entityId: newSupplier.id,
        summary: `Added supplier ${newSupplier.name} (${newSupplier.phone})`,
      });

      toast.success('Supplier added successfully');
      return newSupplier;
    } catch (error) {
      console.error('Add supplier error:', error);
      toast.error('Failed to add supplier');
      throw error;
    }
  };

  const updateSupplier = async (supplierId: string, updates: Partial<Supplier>) => {
    if (!user?.tenantId) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Suppliers & Payables require Starter plan or higher. Upgrade in Billing.');
      return;
    }
    if (!canManageInventoryData(user) && !hasSectionAccess(user, 'suppliers')) {
      toast.error('You do not have permission to update suppliers');
      return;
    }
    if (updates.phone !== undefined && updates.phone.trim().length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }

    try {
      const existing = await localDb.suppliers.get(supplierId);
      if (!existing) return;

      const cleanUpdatedEmail =
        updates.email !== undefined ? updates.email.trim().toLowerCase() : (existing.email || '').trim().toLowerCase();
      if (updates.email !== undefined && cleanUpdatedEmail) {
        const tenantSuppliers = await localDb.suppliers.where('tenantId').equals(user.tenantId).toArray();
        if (
          tenantSuppliers.some(
            (s) => s.id !== supplierId && (s.email || '').trim().toLowerCase() === cleanUpdatedEmail
          )
        ) {
          toast.error('This email address is already used by another supplier. Please enter a different email.');
          return;
        }
      }

      const updated: Supplier = stripUndefined({
        ...existing,
        ...updates,
        email: updates.email !== undefined ? cleanUpdatedEmail || undefined : existing.email,
      });
      await localDb.suppliers.put(updated);

      if (navigator.onLine) {
        const path = `tenants/${user.tenantId}/suppliers/${supplierId}`;
        try {
          await setDoc(doc(db, 'tenants', user.tenantId, 'suppliers', supplierId), stripUndefined(updated));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: user.tenantId,
            table: 'suppliers',
            action: 'update',
            data: updated,
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.UPDATE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: user.tenantId,
          table: 'suppliers',
          action: 'update',
          data: updated,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: user.tenantId,
        branchId: user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'SUPPLIER_UPDATED',
        entityType: 'supplier',
        entityId: supplierId,
        summary: `Updated supplier ${updated.name}`,
      });

      toast.success('Supplier updated');
      return updated;
    } catch (error) {
      console.error('Update supplier error:', error);
      toast.error('Failed to update supplier');
    }
  };

  const deleteSupplier = async (supplierId: string) => {
    if (!user?.tenantId) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('Only business admins can delete suppliers');
      return;
    }
    try {
      const existing = await localDb.suppliers.get(supplierId);
      await localDb.suppliers.delete(supplierId);
      if (navigator.onLine) {
        const path = `tenants/${user.tenantId}/suppliers/${supplierId}`;
        try {
          await deleteDoc(doc(db, 'tenants', user.tenantId, 'suppliers', supplierId));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: user.tenantId,
            table: 'suppliers',
            action: 'delete',
            data: { id: supplierId },
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
          tenantId: user.tenantId,
          table: 'suppliers',
          action: 'delete',
          data: { id: supplierId },
          status: 'pending',
          createdAt: Date.now(),
        });
      }
      void logWorkspaceAudit({
        tenantId: user.tenantId,
        branchId: user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'SUPPLIER_DELETED',
        entityType: 'supplier',
        entityId: supplierId,
        summary: `Removed supplier ${existing?.name || supplierId}`,
      });
      toast.success('Supplier removed');
    } catch (error) {
      console.error('Delete supplier error:', error);
      toast.error('Failed to delete supplier');
    }
  };

  const bulkImportSuppliers = async (
    rows: Array<{
      name: string;
      contactPerson?: string;
      phone: string;
      email?: string;
      address?: string;
      category?: string;
      currentBalance?: number;
      status?: 'active' | 'inactive';
    }>
  ): Promise<number> => {
    if (!user?.tenantId) return 0;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return 0;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Suppliers & Payables require Starter plan or higher. Upgrade in Billing.');
      return 0;
    }
    if (
      !canManageInventoryData(user) &&
      !hasSectionAccess(user, 'suppliers') &&
      !hasSectionAccess(user, 'bulk_import')
    ) {
      toast.error('You do not have permission to import suppliers');
      return 0;
    }

    const existingSuppliers = await localDb.suppliers.where('tenantId').equals(user.tenantId).toArray();
    const usedEmails = new Set(
      existingSuppliers.map((s) => (s.email || '').trim().toLowerCase()).filter(Boolean)
    );

    const nowIso = new Date().toISOString();
    const toCreate: Supplier[] = [];
    let skippedConflicts = 0;

    for (const row of rows) {
      const name = String(row.name || '').trim().slice(0, 150);
      const phone = String(row.phone || '').trim().slice(0, 30);
      if (!name || phone.length < 10) continue;

      const cleanEmail = String(row.email || '').trim().toLowerCase().slice(0, 254);
      if (cleanEmail && usedEmails.has(cleanEmail)) {
        skippedConflicts++;
        continue;
      }
      if (cleanEmail) usedEmails.add(cleanEmail);

      toCreate.push(
        stripUndefined({
          id: crypto.randomUUID(),
          tenantId: user.tenantId,
          name,
          contactPerson: row.contactPerson ? String(row.contactPerson).trim().slice(0, 120) : undefined,
          phone,
          email: cleanEmail || undefined,
          address: row.address ? String(row.address).trim().slice(0, 250) : undefined,
          category: String(row.category || 'Wholesale').trim().slice(0, 80) || 'Wholesale',
          currentBalance: Math.max(0, Number(row.currentBalance) || 0),
          status: row.status === 'inactive' ? 'inactive' : 'active',
          createdAt: nowIso,
        })
      );
    }

    if (toCreate.length === 0) {
      toast.error(
        skippedConflicts > 0
          ? 'Skipped suppliers with duplicate email addresses.'
          : 'No valid supplier rows to import (name and 10+ digit phone required).'
      );
      return 0;
    }

    await localDb.suppliers.bulkPut(toCreate);
    if (navigator.onLine) {
      const CHUNK_SIZE = 12;
      for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
        const chunk = toCreate.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (supplier) => {
            try {
              const supplierRef = doc(collection(db, 'tenants', user.tenantId, 'suppliers'), supplier.id);
              await setDoc(supplierRef, supplier);
            } catch {
              await localDb.syncQueue.add({
                tenantId: user.tenantId,
                table: 'suppliers',
                action: 'create',
                data: supplier,
                status: 'pending',
                createdAt: Date.now(),
              });
            }
          })
        );
      }
    } else {
      await localDb.syncQueue.bulkAdd(
        toCreate.map((supplier) => ({
          tenantId: user.tenantId,
          table: 'suppliers' as const,
          action: 'create' as const,
          data: supplier,
          status: 'pending' as const,
          createdAt: Date.now(),
        }))
      );
    }

    void logWorkspaceAudit({
      tenantId: user.tenantId,
      branchId: user.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SUPPLIER_BULK_IMPORT',
      entityType: 'supplier',
      summary: `Imported ${toCreate.length} supplier(s) via Smart Import`,
    });

    toast.success(
      `Imported ${toCreate.length} supplier${toCreate.length === 1 ? '' : 's'}${
        skippedConflicts > 0 ? ` (${skippedConflicts} duplicate email skipped)` : ''
      }`
    );
    return toCreate.length;
  };

  return {
    suppliers,
    loading,
    addSupplier,
    bulkImportSuppliers,
    updateSupplier,
    deleteSupplier,
  };
}
