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
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenant } = useAuthStore();

  useEffect(() => {
    if (!user?.tenantId) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const subscription = liveQuery(() =>
      localDb.suppliers.where('tenantId').equals(user.tenantId).toArray()
    ).subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  return {
    suppliers,
    loading,
    addSupplier,
    updateSupplier,
    deleteSupplier,
  };
}
