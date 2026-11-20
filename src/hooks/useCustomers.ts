import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { localDb } from '../services/db';
import { Customer } from '../types';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useCustomers() {
  const { tenant, user } = useAuthStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const subscription = liveQuery(() =>
      localDb.customers.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setCustomers(sorted);
        setIsLoading(false);
      },
      error: (error) => {
        console.error('Fetch customers error:', error);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [tenant?.id]);

  const addCustomer = async (
    customerData: Omit<Customer, 'id' | 'tenantId' | 'createdAt' | 'loyaltyPoints' | 'currentBalance'>
  ) => {
    if (!tenant) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    const phone = (customerData.phone || '').trim();
    if (phone.length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }

    const cleanEmail = customerData.email?.trim().toLowerCase() || '';
    if (cleanEmail) {
      const tenantCustomers = await localDb.customers.where('tenantId').equals(tenant.id).toArray();
      if (tenantCustomers.some((c) => (c.email || '').trim().toLowerCase() === cleanEmail)) {
        toast.error('This email address is already used by another customer. Please enter a different email.');
        return;
      }
    }

    const newCustomer: Customer = stripUndefined({
      ...customerData,
      name: customerData.name.trim(),
      phone,
      email: cleanEmail || undefined,
      address: customerData.address?.trim() || undefined,
      creditLimit: Number(customerData.creditLimit) || 0,
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      loyaltyPoints: 0,
      currentBalance: 0,
      createdAt: new Date().toISOString(),
    });

    try {
      await localDb.customers.put(newCustomer);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/customers/${newCustomer.id}`;
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/customers`, newCustomer.id), stripUndefined(newCustomer));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'customers',
            action: 'create',
            data: newCustomer,
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
          table: 'customers',
          action: 'create',
          data: newCustomer,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      if (user) {
        void logWorkspaceAudit({
          tenantId: tenant.id,
          branchId: user.branchId,
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          action: 'CUSTOMER_CREATED',
          entityType: 'customer',
          entityId: newCustomer.id,
          summary: `Added customer ${newCustomer.name} (${newCustomer.phone})`,
        });
      }

      toast.success('Customer added successfully');
      return newCustomer;
    } catch (error) {
      console.error('Add customer error:', error);
      toast.error('Failed to add customer');
    }
  };

  const updateCustomer = async (customerId: string, updates: Partial<Customer>) => {
    if (!tenant) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (updates.phone !== undefined && updates.phone.trim().length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }
    try {
      const existing = await localDb.customers.get(customerId);
      if (!existing) return;

      const cleanUpdatedEmail =
        updates.email !== undefined ? updates.email.trim().toLowerCase() : (existing.email || '').trim().toLowerCase();
      if (updates.email !== undefined && cleanUpdatedEmail) {
        const tenantCustomers = await localDb.customers.where('tenantId').equals(tenant.id).toArray();
        if (
          tenantCustomers.some(
            (c) => c.id !== customerId && (c.email || '').trim().toLowerCase() === cleanUpdatedEmail
          )
        ) {
          toast.error('This email address is already used by another customer. Please enter a different email.');
          return;
        }
      }

      const updated: Customer = stripUndefined({
        ...existing,
        ...updates,
        email: updates.email !== undefined ? cleanUpdatedEmail || undefined : existing.email,
      });
      await localDb.customers.put(updated);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/customers/${customerId}`;
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/customers`, customerId), stripUndefined(updated));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'customers',
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
          tenantId: tenant.id,
          table: 'customers',
          action: 'update',
          data: updated,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      if (user) {
        void logWorkspaceAudit({
          tenantId: tenant.id,
          branchId: user.branchId,
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          action: 'CUSTOMER_UPDATED',
          entityType: 'customer',
          entityId: customerId,
          summary: `Updated customer ${updated.name} (Limit: UGX ${(updated.creditLimit || 0).toLocaleString()})`,
        });
      }

      toast.success('Customer updated');
      return updated;
    } catch (error) {
      console.error('Update customer error:', error);
      toast.error('Failed to update customer');
    }
  };

  const deleteCustomer = async (customerId: string) => {
    if (!tenant || !user) return;
    if (user.role !== 'admin') {
      toast.error('Only business admins can delete customers');
      return;
    }
    try {
      const existing = await localDb.customers.get(customerId);
      await localDb.customers.delete(customerId);
      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/customers/${customerId}`;
        try {
          await deleteDoc(doc(db, `tenants/${tenant.id}/customers`, customerId));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'customers',
            action: 'delete',
            data: { id: customerId },
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
          table: 'customers',
          action: 'delete',
          data: { id: customerId },
          status: 'pending',
          createdAt: Date.now(),
        });
      }
      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'CUSTOMER_DELETED',
        entityType: 'customer',
        entityId: customerId,
        summary: `Removed customer ${existing?.name || customerId}`,
      });
      toast.success('Customer removed');
    } catch (error) {
      console.error('Delete customer error:', error);
      toast.error('Failed to delete customer');
    }
  };

  return { customers, isLoading, addCustomer, updateCustomer, deleteCustomer };
}
