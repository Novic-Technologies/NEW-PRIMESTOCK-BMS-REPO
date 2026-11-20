import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { StockAdjustment, StockTransfer } from '../types';
import { applyBranchStockDelta, getEffectiveStock } from '../utils/branchStock';
import { computeTrialState } from '../utils/trialUtils';
import { stripUndefined } from '../utils/firestoreUtils';
import { canManageInventoryData } from '../utils/rbac';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useStockOperations() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);

  useEffect(() => {
    if (!tenant) {
      setTransfers([]);
      setAdjustments([]);
      return;
    }

    const subTransfers = liveQuery(() =>
      localDb.stockTransfers.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => setTransfers([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    });

    const subAdjustments = liveQuery(() =>
      localDb.stockAdjustments.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => setAdjustments([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    });

    return () => {
      subTransfers.unsubscribe();
      subAdjustments.unsubscribe();
    };
  }, [tenant?.id]);

  const persistRecord = async (
    table: 'products' | 'stockTransfers' | 'stockAdjustments',
    action: 'create' | 'update',
    record: any
  ) => {
    if (!tenant) return;
    const cleaned = stripUndefined(record);
    await localDb.table<any, string>(table).put(cleaned);
    if (navigator.onLine) {
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/${table}`, cleaned.id), cleaned);
      } catch {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table,
          action,
          data: cleaned,
          status: 'pending',
          createdAt: Date.now(),
        });
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

  const recordAdjustment = async (params: {
    productId: string;
    newStock: number;
    reason: StockAdjustment['reason'];
    notes?: string;
    branchId?: string;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can record stock adjustments');
      return;
    }

    const product = await localDb.products.get(params.productId);
    if (!product) return;

    const targetBranch =
      params.branchId ||
      (activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined);

    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);
    const previousStock = getEffectiveStock(product, targetBranch);
    const cleanNew = Math.max(0, Number(params.newStock) || 0);
    const delta = cleanNew - previousStock;

    const updatedStock = applyBranchStockDelta(product, targetBranch, delta, branchIds);
    const updatedProduct = stripUndefined({
      ...product,
      currentStock: updatedStock.currentStock,
      branchStock: updatedStock.branchStock,
    });

    const adjustment: StockAdjustment = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      productId: product.id,
      productName: product.name,
      previousStock,
      newStock: cleanNew,
      delta,
      reason: params.reason,
      notes: params.notes?.trim() || undefined,
      adjustedBy: user.uid,
      adjustedByName: user.name,
      createdAt: new Date().toISOString(),
    });

    await Promise.all([
      persistRecord('products', 'update', updatedProduct),
      persistRecord('stockAdjustments', 'create', adjustment),
    ]);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'STOCK_ADJUSTED',
      entityType: 'product',
      entityId: product.id,
      summary: `${product.name}: ${previousStock} -> ${cleanNew} (${params.reason})`,
    });

    toast.success(`Stock adjusted (${params.reason})`);
    return adjustment;
  };

  const transferStock = async (params: {
    productId: string;
    fromBranchId: string;
    toBranchId: string;
    quantity: number;
    notes?: string;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can transfer stock between branches');
      return;
    }
    if (params.fromBranchId === params.toBranchId) {
      toast.error('Source and destination branches must be different');
      return;
    }

    const product = await localDb.products.get(params.productId);
    if (!product) return;

    const qty = Math.max(0, Number(params.quantity) || 0);
    if (qty <= 0) {
      toast.error('Transfer quantity must be greater than 0');
      return;
    }

    const availableSource = getEffectiveStock(product, params.fromBranchId);
    if (qty > availableSource) {
      toast.error(`Only ${availableSource} units available at source branch`);
      return;
    }

    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);
    const fromBranch = allBranches.find((b) => b.id === params.fromBranchId);
    const toBranch = allBranches.find((b) => b.id === params.toBranchId);

    const afterOut = applyBranchStockDelta(product, params.fromBranchId, -qty, branchIds);
    const midProduct = { ...product, ...afterOut };
    const afterIn = applyBranchStockDelta(midProduct, params.toBranchId, qty, branchIds);

    const updatedProduct = stripUndefined({
      ...product,
      currentStock: afterIn.currentStock,
      branchStock: afterIn.branchStock,
    });

    const transfer: StockTransfer = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      productId: product.id,
      productName: product.name,
      fromBranchId: params.fromBranchId,
      fromBranchName: fromBranch?.name || 'Source Branch',
      toBranchId: params.toBranchId,
      toBranchName: toBranch?.name || 'Destination Branch',
      quantity: qty,
      notes: params.notes?.trim() || undefined,
      status: 'completed',
      transferredBy: user.uid,
      createdAt: new Date().toISOString(),
    });

    await Promise.all([
      persistRecord('products', 'update', updatedProduct),
      persistRecord('stockTransfers', 'create', transfer),
    ]);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: params.fromBranchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'STOCK_TRANSFERRED',
      entityType: 'stockTransfer',
      entityId: transfer.id,
      summary: `Transferred ${qty} ${product.unit} of ${product.name} from ${transfer.fromBranchName} to ${transfer.toBranchName}`,
    });

    toast.success(`Transferred ${qty} ${product.unit} to ${transfer.toBranchName}`);
    return transfer;
  };

  return {
    transfers,
    adjustments,
    recordAdjustment,
    transferStock,
  };
}
