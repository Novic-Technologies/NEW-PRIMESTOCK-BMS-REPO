import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { Expense, ProductBatch, PurchaseOrder, PurchaseOrderGrnEntry, PurchaseOrderItem } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { applyBranchStockDelta } from '../utils/branchStock';
import { convertCurrencyToUgx, getNextExpiringBatch } from '../utils/inventoryMath';
import { canManageInventoryData } from '../utils/rbac';
import { canAccessFeature } from '../utils/planLimits';
import { logWorkspaceAudit } from './useAuditLog';
import { normalizeIsoDate } from '../utils/smartImportParser';
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
    currency?: 'UGX' | 'USD' | 'KES';
    exchangeRateToUgx?: number;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Purchase Orders require Starter plan or higher. Upgrade in Billing.');
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

    const currency = params.currency || 'UGX';
    const rate = currency === 'UGX' ? 1 : Math.max(1, Number(params.exchangeRateToUgx) || (currency === 'USD' ? 3700 : 28.5));
    const foreignTotalAmount = params.items.reduce((sum, item) => sum + item.total, 0);
    const totalAmount = convertCurrencyToUgx(foreignTotalAmount, currency, rate);
    const ugxItems: PurchaseOrderItem[] = params.items.map((it) => {
      const unitCostUgx = convertCurrencyToUgx(it.unitCost, currency, rate);
      return {
        ...it,
        receivedQuantity: 0,
        unitCost: unitCostUgx,
        total: Math.round(unitCostUgx * it.quantity),
      };
    });
    const computedTotal = ugxItems.reduce((sum, it) => sum + it.total, 0) || totalAmount;
    const paidAmount = Math.min(computedTotal, Math.max(0, Number(params.paidAmount) || 0));
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;

    const po: PurchaseOrder = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      branchId: targetBranch,
      reference: `PO-${Date.now().toString().slice(-6)}`,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      currency,
      exchangeRateToUgx: currency === 'UGX' ? undefined : rate,
      foreignTotalAmount: currency === 'UGX' ? undefined : foreignTotalAmount,
      items: ugxItems,
      totalAmount: computedTotal,
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
      summary: `Created ${po.reference} for ${po.supplierName} (${po.items.length} items, ${
        currency !== 'UGX' ? `${currency} ${foreignTotalAmount.toLocaleString()} = ` : ''
      }UGX ${po.totalAmount.toLocaleString()})`,
    });
    toast.success(`Purchase Order ${po.reference} created`);
    return po;
  };

  const receivePurchaseOrderPartial = async (params: {
    poId: string;
    lineReceipts: Array<{
      productId: string;
      quantityReceived: number;
      batchNumber?: string;
      expiryDate?: string;
    }>;
    paidAtReceiving: number;
    paymentMethod?: string;
    notes?: string;
  }) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Purchase Orders require Starter plan or higher. Upgrade in Billing.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can receive stock');
      return;
    }
    const po = await localDb.purchaseOrders.get(params.poId);
    if (!po || (po.status !== 'ordered' && po.status !== 'partially_received')) return;

    const receiptMap = new Map(params.lineReceipts.map((r) => [r.productId, r]));
    const nowIso = new Date().toISOString();
    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);
    const targetBranch =
      po.branchId || (activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined);

    const grnItems: PurchaseOrderGrnEntry['items'] = [];
    let receivedValueUgx = 0;

    const updatedItems: PurchaseOrderItem[] = po.items.map((item) => {
      const prevRecv = Number(item.receivedQuantity) || 0;
      const remaining = Math.max(0, item.quantity - prevRecv);
      const req = receiptMap.get(item.productId);
      const qtyNow = Math.min(remaining, Math.max(0, Math.round(Number(req?.quantityReceived) || 0)));
      if (qtyNow > 0) {
        grnItems.push({
          productId: item.productId,
          name: item.name,
          quantityReceived: qtyNow,
          batchNumber: req?.batchNumber?.trim() || undefined,
          expiryDate: req?.expiryDate?.trim() || undefined,
        });
        receivedValueUgx += qtyNow * item.unitCost;
      }
      return {
        ...item,
        receivedQuantity: prevRecv + qtyNow,
      };
    });

    if (grnItems.length === 0) {
      toast.error('Enter at least 1 unit received to record a Goods Received Note (GRN)');
      return;
    }

    await Promise.all(
      grnItems.map(async (grnLine) => {
        const product = await localDb.products.get(grnLine.productId);
        if (!product) return;
        const poItem = po.items.find((i) => i.productId === grnLine.productId);
        const stockUpdate = applyBranchStockDelta(product, targetBranch, grnLine.quantityReceived, branchIds);
        const existingBatches: ProductBatch[] = Array.isArray(product.batches)
          ? [...product.batches]
          : product.currentStock > 0 && (product.batchNumber || product.expiryDate)
          ? [
              {
                id: crypto.randomUUID(),
                batchNumber: product.batchNumber || 'EXISTING-LOT',
                expiryDate: product.expiryDate,
                quantity: product.currentStock,
                branchId: targetBranch,
              },
            ]
          : [];

        const newLot: ProductBatch = stripUndefined({
          id: crypto.randomUUID(),
          batchNumber: grnLine.batchNumber || `${po.reference}-LOT`,
          expiryDate: grnLine.expiryDate,
          quantity: grnLine.quantityReceived,
          branchId: targetBranch,
          unitCost: poItem?.unitCost || product.buyingPrice,
          receivedAt: nowIso,
        });
        const mergedBatches = [...existingBatches, newLot];
        const nextLot = getNextExpiringBatch(mergedBatches, targetBranch);

        await syncEntity('products', 'update', {
          ...product,
          currentStock: stockUpdate.currentStock,
          branchStock: stockUpdate.branchStock,
          buyingPrice: poItem && poItem.unitCost > 0 ? poItem.unitCost : product.buyingPrice,
          batches: mergedBatches,
          batchNumber: nextLot?.batchNumber || product.batchNumber,
          expiryDate: nextLot?.expiryDate || product.expiryDate,
        });
      })
    );

    const additionalPaid = Math.max(0, Number(params.paidAtReceiving) || 0);
    const totalPaid = Math.min(po.totalAmount, (po.paidAmount || 0) + additionalPaid);
    const allCompleted = updatedItems.every((it) => (it.receivedQuantity || 0) >= it.quantity);
    const nextStatus: PurchaseOrder['status'] = allCompleted ? 'received' : 'partially_received';

    const unpaidDelta = Math.max(0, receivedValueUgx - additionalPaid);
    if (unpaidDelta > 0) {
      const supplier = await localDb.suppliers.get(po.supplierId);
      if (supplier) {
        await syncEntity('suppliers', 'update', {
          ...supplier,
          currentBalance: (supplier.currentBalance || 0) + unpaidDelta,
        });
      }
    }

    if (additionalPaid > 0) {
      const expense: Expense = stripUndefined({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        branchId: targetBranch,
        category: 'Supplies',
        description: `Stock Restock GRN (${po.reference} - ${po.supplierName})`,
        amount: additionalPaid,
        paymentMethod: params.paymentMethod || 'Cash',
        expenseDate: nowIso.split('T')[0],
        recordedBy: user.uid,
        createdAt: nowIso,
      });
      await syncEntity('expenses', 'create', expense);
    }

    const grnEntry: PurchaseOrderGrnEntry = stripUndefined({
      id: `GRN-${Date.now().toString().slice(-6)}`,
      receivedAt: nowIso,
      receivedBy: user.uid,
      receivedByName: user.name,
      notes: params.notes?.trim() || undefined,
      items: grnItems,
    });

    const updatedPo: PurchaseOrder = stripUndefined({
      ...po,
      items: updatedItems,
      paidAmount: totalPaid,
      status: nextStatus,
      receivedAt: allCompleted ? nowIso : po.receivedAt,
      grnHistory: [...(po.grnHistory || []), grnEntry],
    });
    await syncEntity('purchaseOrders', 'update', updatedPo);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: allCompleted ? 'PO_RECEIVED' : 'PO_PARTIAL_GRN',
      entityType: 'purchaseOrder',
      entityId: po.id,
      summary: `Recorded ${grnEntry.id} for ${po.reference} (${grnItems.reduce(
        (s, i) => s + i.quantityReceived,
        0
      )} units, status: ${nextStatus})`,
    });

    toast.success(
      allCompleted
        ? `${po.reference} fully received — stock & batch lots updated`
        : `${grnEntry.id} recorded (${po.reference} partially received)`
    );
    return updatedPo;
  };

  const receivePurchaseOrder = async (
    poId: string,
    paidAtReceiving: number,
    paymentMethod = 'Cash'
  ) => {
    const po = await localDb.purchaseOrders.get(poId);
    if (!po) return;
    return receivePurchaseOrderPartial({
      poId,
      lineReceipts: po.items.map((item) => ({
        productId: item.productId,
        quantityReceived: Math.max(0, item.quantity - (Number(item.receivedQuantity) || 0)),
      })),
      paidAtReceiving,
      paymentMethod,
    });
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

  const bulkImportPurchaseOrders = async (
    rows: Array<Record<string, any>>,
    options?: { markReceived?: boolean }
  ): Promise<number> => {
    if (!tenant || !user) return 0;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return 0;
    }
    if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
      toast.error('Purchase Orders require Starter plan or higher. Upgrade in Billing.');
      return 0;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can import purchase orders');
      return 0;
    }

    const [allSuppliers, allProducts, allBranches] = await Promise.all([
      localDb.suppliers.where('tenantId').equals(tenant.id).toArray(),
      localDb.products.where('tenantId').equals(tenant.id).toArray(),
      localDb.branches.where('tenantId').equals(tenant.id).toArray(),
    ]);
    const branchIds = allBranches.map((b) => b.id);
    const targetBranch =
      activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId || undefined;

    // Group rows that share an explicit reference + supplierName into a single multi-line PO
    const groups = new Map<
      string,
      {
        reference: string;
        supplierName: string;
        supplierPhone: string;
        expectedDate?: string;
        notes?: string;
        paidAmount: number;
        status: PurchaseOrder['status'];
        items: PurchaseOrderItem[];
      }
    >();

    rows.forEach((row, idx) => {
      const supplierName = String(row.supplierName || '').trim().slice(0, 150);
      if (!supplierName) return;

      const explicitRef = String(row.reference || '').trim().slice(0, 64);
      const groupKey = explicitRef
        ? `${explicitRef.toLowerCase()}::${supplierName.toLowerCase()}`
        : `SINGLE_${idx}`;

      const rawItems = Array.isArray(row.items) && row.items.length > 0 ? row.items : null;
      const lineItems: PurchaseOrderItem[] = rawItems
        ? rawItems.slice(0, 200).map((it: any) => {
            const matchedProd = allProducts.find(
              (p) =>
                (it.sku && p.sku?.toLowerCase() === String(it.sku).toLowerCase()) ||
                p.name.toLowerCase() === String(it.name || '').trim().toLowerCase()
            );
            const qty = Math.max(1, Number(it.quantity) || 1);
            const unitCost = Math.max(0, Number(it.unitCost) || matchedProd?.buyingPrice || 0);
            return {
              productId: matchedProd?.id || crypto.randomUUID(),
              name: String(it.name || matchedProd?.name || 'Restock Item').slice(0, 150),
              quantity: qty,
              unitCost,
              total: Math.max(0, Number(it.total) || qty * unitCost),
            };
          })
        : [
            (() => {
              const itemName = String(row.itemName || '').trim();
              const cleanSku = String(row.sku || '').trim().toLowerCase();
              const cleanName = itemName.toLowerCase();
              const matchedProd =
                (cleanSku
                  ? allProducts.find((p) => p.sku?.toLowerCase() === cleanSku || p.barcode?.toLowerCase() === cleanSku)
                  : undefined) ||
                (cleanName ? allProducts.find((p) => p.name.trim().toLowerCase() === cleanName) : undefined) ||
                (cleanName ? allProducts.find((p) => p.name.toLowerCase().includes(cleanName)) : undefined);
              const qty = Math.max(1, Number(row.quantity) || 1);
              const unitCost =
                Math.max(0, Number(row.unitCost) || 0) ||
                (Number(row.totalAmount) > 0 && qty > 0 ? Math.round(Number(row.totalAmount) / qty) : 0) ||
                matchedProd?.buyingPrice ||
                0;
              return {
                productId: matchedProd?.id || crypto.randomUUID(),
                name: (itemName || matchedProd?.name || 'Restock Item').slice(0, 150),
                quantity: qty,
                unitCost,
                total: Math.max(0, Number(row.totalAmount) || qty * unitCost),
              };
            })(),
          ];

      const existing = groups.get(groupKey);
      const rowStatus: PurchaseOrder['status'] = options?.markReceived
        ? 'received'
        : String(row.status || '').toLowerCase() === 'received'
        ? 'received'
        : 'ordered';

      if (existing) {
        existing.items.push(...lineItems);
        existing.paidAmount += Math.max(0, Number(row.paidAmount) || 0);
      } else {
        groups.set(groupKey, {
          reference: explicitRef || `PO-${Date.now().toString().slice(-6)}-${idx + 1}`,
          supplierName,
          supplierPhone: String(row.supplierPhone || '').trim().slice(0, 30),
          expectedDate: row.expectedDate ? normalizeIsoDate(row.expectedDate).slice(0, 64) : undefined,
          notes: row.notes ? String(row.notes).trim().slice(0, 300) : undefined,
          paidAmount: Math.max(0, Number(row.paidAmount) || 0),
          status: rowStatus,
          items: lineItems,
        });
      }
    });

    if (groups.size === 0) {
      toast.error('No valid purchase order rows found (supplierName and item required).');
      return 0;
    }

    const nowIso = new Date().toISOString();
    let importedCount = 0;

    for (const group of groups.values()) {
      let supplier = allSuppliers.find(
        (s) => s.name.trim().toLowerCase() === group.supplierName.trim().toLowerCase()
      );
      if (!supplier && group.supplierPhone.length >= 10) {
        const newSup = {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          name: group.supplierName,
          phone: group.supplierPhone,
          category: 'Wholesale',
          currentBalance: 0,
          status: 'active' as const,
          createdAt: nowIso,
        };
        await syncEntity('suppliers', 'create', newSup);
        allSuppliers.push(newSup);
        supplier = newSup;
      }

      const supplierId = supplier?.id || crypto.randomUUID();
      const totalAmount = group.items.reduce((s, i) => s + i.total, 0);
      const paidAmount = Math.min(totalAmount, group.paidAmount);

      const po: PurchaseOrder = stripUndefined({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        branchId: targetBranch,
        reference: group.reference,
        supplierId,
        supplierName: supplier?.name || group.supplierName,
        items: group.items.slice(0, 200),
        totalAmount,
        paidAmount,
        status: group.status,
        expectedDate: group.expectedDate,
        receivedAt: group.status === 'received' ? nowIso : undefined,
        notes: group.notes,
        createdBy: user.uid,
        createdAt: nowIso,
      });

      await syncEntity('purchaseOrders', 'create', po);

      if (group.status === 'received') {
        for (const item of po.items) {
          const prod = allProducts.find((p) => p.id === item.productId);
          if (prod) {
            const stockUpdate = applyBranchStockDelta(prod, targetBranch, item.quantity, branchIds);
            const updatedProd = {
              ...prod,
              currentStock: stockUpdate.currentStock,
              branchStock: stockUpdate.branchStock,
              buyingPrice: item.unitCost > 0 ? item.unitCost : prod.buyingPrice,
            };
            Object.assign(prod, updatedProd);
            await syncEntity('products', 'update', updatedProd);
          }
        }
        const unpaid = Math.max(0, totalAmount - paidAmount);
        if (unpaid > 0 && supplier) {
          const updatedSupplier = {
            ...supplier,
            currentBalance: (supplier.currentBalance || 0) + unpaid,
          };
          Object.assign(supplier, updatedSupplier);
          await syncEntity('suppliers', 'update', updatedSupplier);
        }
      }

      importedCount++;
    }

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: targetBranch,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'PO_BULK_IMPORT',
      entityType: 'purchaseOrder',
      summary: `Imported ${importedCount} purchase order(s) via Smart Import`,
    });

    toast.success(`Imported ${importedCount} purchase order${importedCount === 1 ? '' : 's'}`);
    return importedCount;
  };

  return {
    purchaseOrders,
    isLoading,
    createPurchaseOrder,
    bulkImportPurchaseOrders,
    receivePurchaseOrder,
    receivePurchaseOrderPartial,
    cancelPurchaseOrder,
  };
}
