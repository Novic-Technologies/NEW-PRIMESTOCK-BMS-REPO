import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { Expense, PurchaseOrder, PurchaseOrderItem } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { applyBranchStockDelta } from '../utils/branchStock';
import { canManageInventoryData } from '../utils/rbac';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function usePurchaseOrders() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setPurchaseOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const sub = liveQuery(() =>
      localDb.purchaseOrders.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setPurchaseOrders(sorted);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Fetch POs error:', err);
        setIsLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, [tenant?.id]);

  const syncEntity = async (
    table: 'purchaseOrders' | 'products' | 'suppliers' | 'expenses',
    action: 'create' | 'update',
    record: any
  ) => {
    if (!tenant) return;
    const cleaned = stripUndefined(record);
    await localDb.table<any, string>(table).put(cleaned);

    if (navigator.onLine) {
      const path = `tenants/${tenant.id}/${table}/${cleaned.id}`;
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/${table}`, cleaned.id), cleaned);
      } catch (error) {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table,
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
        table,
        action,
        data: cleaned,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
  };

  const createPurchaseOrder = async (params: {
    supplierId: string;
    supplierName: string;
    items: PurchaseOrderItem[];
    expectedDate?: string;
    notes?: string;
    paidAmount?: number;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can create purchase orders');
      return;
    }
    if (!params.supplierId || params.items.length === 0) {
      toast.error('Select a supplier and add at least one product');
      return;
    }

    const totalAmount = params.items.reduce((sum, item) => sum + item.total, 0);
    const paidAmount = Math.min(totalAmount, Math.max(0, Number(params.paidAmount) || 0));
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;

    const po: PurchaseOrder = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      reference: `PO-${Date.now().toString().slice(-6)}`,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      items: params.items,
      totalAmount,
      paidAmount,
      status: 'ordered',
      expectedDate: params.expectedDate || undefined,
      notes: params.notes?.trim() || undefined,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
    });

    await syncEntity('purchaseOrders', 'create', po);
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'PO_CREATED',
      entityType: 'purchaseOrder',
      entityId: po.id,
      summary: `Created ${po.reference} for ${po.supplierName} (${po.items.length} items, UGX ${po.totalAmount.toLocaleString()})`,
    });
    toast.success(`Purchase Order ${po.reference} created`);
    return po;
  };

  const receivePurchaseOrder = async (
    poId: string,
    paidAtReceiving: number,
    paymentMethod = 'Cash'
  ) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can receive stock');
      return;
    }
    const po = await localDb.purchaseOrders.get(poId);
    if (!po || po.status !== 'ordered') return;

    const additionalPaid = Math.max(0, Number(paidAtReceiving) || 0);
    const totalPaid = Math.min(po.totalAmount, (po.paidAmount || 0) + additionalPaid);
    const unpaidBalance = Math.max(0, po.totalAmount - totalPaid);
    const nowIso = new Date().toISOString();

    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);
    const targetBranch =
      po.branchId || (activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined);

    await Promise.all(
      po.items.map(async (item) => {
        const product = await localDb.products.get(item.productId);
        if (product) {
          const stockUpdate = applyBranchStockDelta(product, targetBranch, item.quantity, branchIds);
          await syncEntity('products', 'update', {
            ...product,
            currentStock: stockUpdate.currentStock,
            branchStock: stockUpdate.branchStock,
            buyingPrice: item.unitCost > 0 ? item.unitCost : product.buyingPrice,
          });
        }
      })
    );

    if (unpaidBalance > 0) {
      const supplier = await localDb.suppliers.get(po.supplierId);
      if (supplier) {
        await syncEntity('suppliers', 'update', {
          ...supplier,
          currentBalance: (supplier.currentBalance || 0) + unpaidBalance,
        });
      }
    }

    if (additionalPaid > 0) {
      const expense: Expense = stripUndefined({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        branchId: targetBranch,
        category: 'Supplies',
        description: `Stock Restock (${po.reference} - ${po.supplierName})`,
        amount: additionalPaid,
        paymentMethod,
        expenseDate: nowIso.split('T')[0],
        recordedBy: user.uid,
        createdAt: nowIso,
      });
      await syncEntity('expenses', 'create', expense);
    }

    const updatedPo: PurchaseOrder = stripUndefined({
      ...po,
      paidAmount: totalPaid,
      status: 'received',
      receivedAt: nowIso,
    });
    await syncEntity('purchaseOrders', 'update', updatedPo);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'PO_RECEIVED',
      entityType: 'purchaseOrder',
      entityId: po.id,
      summary: `Received ${po.reference} from ${po.supplierName} (UGX ${po.totalAmount.toLocaleString()})`,
    });

    toast.success(`${po.reference} received — stock levels updated`);
    return updatedPo;
  };

  const cancelPurchaseOrder = async (poId: string) => {
    if (!tenant || !user) return;
    if (!canManageInventoryData(user)) return;
    const po = await localDb.purchaseOrders.get(poId);
    if (!po || po.status !== 'ordered') return;
    await syncEntity('purchaseOrders', 'update', { ...po, status: 'cancelled' });
    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: po.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'PO_CANCELLED',
      entityType: 'purchaseOrder',
      entityId: po.id,
      summary: `Cancelled Purchase Order ${po.reference} (${po.supplierName})`,
    });
    toast.success(`Purchase Order ${po.reference} cancelled`);
  };

  return {
    purchaseOrders,
    isLoading,
    createPurchaseOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
  };
}
