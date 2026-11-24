import { doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { localDb } from '../services/db';
import {
  Customer,
  Expense,
  Product,
  PurchaseOrder,
  Sale,
  SmartImportEntityType,
  SmartImportReconciledRow,
  Supplier,
} from '../types';
import { stripUndefined } from './firestoreUtils';

export interface ReconcileContext {
  products?: Product[];
  customers?: Customer[];
  suppliers?: Supplier[];
  sales?: Sale[];
  purchases?: PurchaseOrder[];
  expenses?: Expense[];
}

export interface ImportUndoSnapshot {
  id: string;
  tenantId: string;
  entityType: SmartImportEntityType;
  label: string;
  createdAt: string;
  createdProductIds: string[];
  createdSaleIds: string[];
  createdCustomerIds: string[];
  createdSupplierIds: string[];
  createdPurchaseIds: string[];
  createdExpenseIds: string[];
}

const UNDO_STORAGE_PREFIX = 'primestock_last_import_snapshot_';

function norm(val: unknown): string {
  return String(val ?? '').trim().toLowerCase();
}

function normDigits(val: unknown): string {
  return String(val ?? '').replace(/[^\d]/g, '').slice(-9);
}

export function reconcileSmartImportRows(
  entityType: SmartImportEntityType,
  rows: Array<Record<string, any>>,
  context: ReconcileContext
): SmartImportReconciledRow[] {
  return rows.map((row, rowIndex) => {
    if (entityType === 'products') {
      const existing = (context.products || []).find(
        (p) =>
          (row.sku && p.sku && norm(p.sku) === norm(row.sku)) ||
          (row.barcode && p.barcode && norm(p.barcode) === norm(row.barcode)) ||
          norm(p.name) === norm(row.name)
      );
      if (!existing) {
        return { rowIndex, action: 'create', resolution: 'create_new', data: row };
      }
      const conflictFields: Array<{ field: string; existingValue: any; incomingValue: any }> = [];
      if (Number(row.sellingPrice) > 0 && Number(row.sellingPrice) !== existing.sellingPrice) {
        conflictFields.push({
          field: 'sellingPrice',
          existingValue: existing.sellingPrice,
          incomingValue: Number(row.sellingPrice),
        });
      }
      if (Number(row.buyingPrice) > 0 && Number(row.buyingPrice) !== existing.buyingPrice) {
        conflictFields.push({
          field: 'buyingPrice',
          existingValue: existing.buyingPrice,
          incomingValue: Number(row.buyingPrice),
        });
      }
      if (Number(row.currentStock) > 0 && Number(row.currentStock) !== existing.currentStock) {
        conflictFields.push({
          field: 'currentStock',
          existingValue: existing.currentStock,
          incomingValue: Number(row.currentStock),
        });
      }
      return {
        rowIndex,
        action: conflictFields.length > 0 ? 'conflict' : 'skip',
        matchedRecordId: existing.id,
        matchedRecordLabel: existing.name,
        matchReason:
          row.sku && existing.sku && norm(row.sku) === norm(existing.sku)
            ? `Matched SKU ${existing.sku}`
            : `Matched product name "${existing.name}"`,
        conflictFields,
        resolution: conflictFields.length > 0 ? 'overwrite' : 'keep_existing',
        data: row,
      };
    }

    if (entityType === 'customers') {
      const incomingDigits = normDigits(row.phone);
      const existing = (context.customers || []).find(
        (c) =>
          (incomingDigits.length >= 9 && normDigits(c.phone) === incomingDigits) ||
          (row.email && c.email && norm(c.email) === norm(row.email))
      );
      if (!existing) {
        return { rowIndex, action: 'create', resolution: 'create_new', data: row };
      }
      const conflictFields: Array<{ field: string; existingValue: any; incomingValue: any }> = [];
      if (norm(row.name) && norm(row.name) !== norm(existing.name)) {
        conflictFields.push({
          field: 'name',
          existingValue: existing.name,
          incomingValue: row.name,
        });
      }
      if (Number(row.currentBalance) > 0 && Number(row.currentBalance) !== existing.currentBalance) {
        conflictFields.push({
          field: 'currentBalance',
          existingValue: existing.currentBalance,
          incomingValue: Number(row.currentBalance),
        });
      }
      return {
        rowIndex,
        action: conflictFields.length > 0 ? 'conflict' : 'link',
        matchedRecordId: existing.id,
        matchedRecordLabel: existing.name,
        matchReason: `Matched existing customer (${existing.phone})`,
        conflictFields,
        resolution: 'keep_existing',
        data: row,
      };
    }

    if (entityType === 'suppliers') {
      const incomingDigits = normDigits(row.phone);
      const existing = (context.suppliers || []).find(
        (s) =>
          (incomingDigits.length >= 9 && normDigits(s.phone) === incomingDigits) ||
          norm(s.name) === norm(row.name)
      );
      if (!existing) {
        return { rowIndex, action: 'create', resolution: 'create_new', data: row };
      }
      return {
        rowIndex,
        action: 'link',
        matchedRecordId: existing.id,
        matchedRecordLabel: existing.name,
        matchReason: `Matches existing supplier "${existing.name}"`,
        resolution: 'keep_existing',
        data: row,
      };
    }

    if (entityType === 'sales') {
      const existing = row.reference
        ? (context.sales || []).find((s) => norm(s.reference) === norm(row.reference))
        : undefined;
      if (existing) {
        return {
          rowIndex,
          action: 'conflict',
          matchedRecordId: existing.id,
          matchedRecordLabel: existing.reference,
          matchReason: `Duplicate receipt reference ${existing.reference}`,
          conflictFields: [
            {
              field: 'total',
              existingValue: existing.total,
              incomingValue: Number(row.total) || 0,
            },
          ],
          resolution: 'keep_existing',
          data: row,
        };
      }
      return { rowIndex, action: 'create', resolution: 'create_new', data: row };
    }

    if (entityType === 'refunds') {
      const matchedSale = row.reference
        ? (context.sales || []).find((s) => norm(s.reference) === norm(row.reference))
        : undefined;
      if (matchedSale) {
        return {
          rowIndex,
          action: matchedSale.status === 'refunded' ? 'skip' : 'link',
          matchedRecordId: matchedSale.id,
          matchedRecordLabel: matchedSale.reference,
          matchReason:
            matchedSale.status === 'refunded'
              ? `${matchedSale.reference} is already refunded`
              : `Links to sale ${matchedSale.reference}`,
          resolution: matchedSale.status === 'refunded' ? 'keep_existing' : 'overwrite',
          data: row,
        };
      }
      return { rowIndex, action: 'create', resolution: 'create_new', data: row };
    }

    if (entityType === 'purchases') {
      const existing = row.reference
        ? (context.purchases || []).find((p) => norm(p.reference) === norm(row.reference))
        : undefined;
      if (existing) {
        return {
          rowIndex,
          action: 'conflict',
          matchedRecordId: existing.id,
          matchedRecordLabel: existing.reference,
          matchReason: `PO reference ${existing.reference} already exists`,
          conflictFields: [
            {
              field: 'totalAmount',
              existingValue: existing.totalAmount,
              incomingValue: Number(row.totalAmount) || 0,
            },
          ],
          resolution: 'keep_existing',
          data: row,
        };
      }
      return { rowIndex, action: 'create', resolution: 'create_new', data: row };
    }

    if (entityType === 'expenses') {
      const dup = (context.expenses || []).find(
        (e) =>
          norm(e.description) === norm(row.description) &&
          Number(e.amount) === Number(row.amount) &&
          (!row.expenseDate || e.expenseDate === row.expenseDate)
      );
      if (dup) {
        return {
          rowIndex,
          action: 'conflict',
          matchedRecordId: dup.id,
          matchedRecordLabel: dup.description,
          matchReason: 'Same description, amount, and date already logged',
          resolution: 'keep_existing',
          data: row,
        };
      }
      return { rowIndex, action: 'create', resolution: 'create_new', data: row };
    }

    return { rowIndex, action: 'create', resolution: 'create_new', data: row };
  });
}

export async function captureTenantIdSnapshot(tenantId: string) {
  const [products, sales, customers, suppliers, purchases, expenses] = await Promise.all([
    localDb.products.where('tenantId').equals(tenantId).primaryKeys(),
    localDb.sales.where('tenantId').equals(tenantId).primaryKeys(),
    localDb.customers.where('tenantId').equals(tenantId).primaryKeys(),
    localDb.suppliers.where('tenantId').equals(tenantId).primaryKeys(),
    localDb.purchaseOrders.where('tenantId').equals(tenantId).primaryKeys(),
    localDb.expenses.where('tenantId').equals(tenantId).primaryKeys(),
  ]);
  return {
    products: new Set(products.map(String)),
    sales: new Set(sales.map(String)),
    customers: new Set(customers.map(String)),
    suppliers: new Set(suppliers.map(String)),
    purchases: new Set(purchases.map(String)),
    expenses: new Set(expenses.map(String)),
  };
}

export async function recordDiffImportSnapshot(
  tenantId: string,
  entityType: SmartImportEntityType,
  label: string,
  before: Awaited<ReturnType<typeof captureTenantIdSnapshot>>
): Promise<ImportUndoSnapshot | null> {
  const after = await captureTenantIdSnapshot(tenantId);
  const diff = (afterSet: Set<string>, beforeSet: Set<string>) =>
    Array.from(afterSet).filter((id) => !beforeSet.has(id));

  const snapshot: ImportUndoSnapshot = {
    id: crypto.randomUUID(),
    tenantId,
    entityType,
    label,
    createdAt: new Date().toISOString(),
    createdProductIds: diff(after.products, before.products),
    createdSaleIds: diff(after.sales, before.sales),
    createdCustomerIds: diff(after.customers, before.customers),
    createdSupplierIds: diff(after.suppliers, before.suppliers),
    createdPurchaseIds: diff(after.purchases, before.purchases),
    createdExpenseIds: diff(after.expenses, before.expenses),
  };

  const totalCreated =
    snapshot.createdProductIds.length +
    snapshot.createdSaleIds.length +
    snapshot.createdCustomerIds.length +
    snapshot.createdSupplierIds.length +
    snapshot.createdPurchaseIds.length +
    snapshot.createdExpenseIds.length;

  if (totalCreated === 0) return null;

  try {
    localStorage.setItem(`${UNDO_STORAGE_PREFIX}${tenantId}`, JSON.stringify(snapshot));
  } catch {
    // Ignore quota error
  }
  return snapshot;
}

export function loadLastImportSnapshot(tenantId?: string): ImportUndoSnapshot | null {
  if (!tenantId) return null;
  try {
    const raw = localStorage.getItem(`${UNDO_STORAGE_PREFIX}${tenantId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ImportUndoSnapshot;
  } catch {
    return null;
  }
}

export function clearLastImportSnapshot(tenantId?: string) {
  if (!tenantId) return;
  try {
    localStorage.removeItem(`${UNDO_STORAGE_PREFIX}${tenantId}`);
  } catch {
    // Ignore
  }
}

export async function undoLastImportSnapshot(tenantId: string): Promise<number> {
  const snapshot = loadLastImportSnapshot(tenantId);
  if (!snapshot) return 0;

  const deleteFromTable = async (
    table: 'products' | 'sales' | 'customers' | 'suppliers' | 'purchaseOrders' | 'expenses',
    ids: string[]
  ): Promise<number> => {
    if (!ids.length) return 0;
    await localDb.table(table).bulkDelete(ids);
    if (navigator.onLine) {
      await Promise.all(
        ids.map((id) =>
          deleteDoc(doc(db, `tenants/${tenantId}/${table}`, id)).catch(async () => {
            await localDb.syncQueue.add({
              tenantId,
              table,
              action: 'delete',
              data: { id },
              status: 'pending',
              createdAt: Date.now(),
            });
          })
        )
      );
    } else {
      await localDb.syncQueue.bulkAdd(
        ids.map((id) => ({
          tenantId,
          table,
          action: 'delete' as const,
          data: { id },
          status: 'pending' as const,
          createdAt: Date.now(),
        }))
      );
    }
    return ids.length;
  };

  const counts = await Promise.all([
    deleteFromTable('products', snapshot.createdProductIds),
    deleteFromTable('sales', snapshot.createdSaleIds),
    deleteFromTable('customers', snapshot.createdCustomerIds),
    deleteFromTable('suppliers', snapshot.createdSupplierIds),
    deleteFromTable('purchaseOrders', snapshot.createdPurchaseIds),
    deleteFromTable('expenses', snapshot.createdExpenseIds),
  ]);

  clearLastImportSnapshot(tenantId);
  return counts.reduce((sum, n) => sum + n, 0);
}

export async function applyUpdatedProductsFromImport(
  tenantId: string,
  updates: Array<{ existing: Product; incoming: Record<string, any> }>
): Promise<number> {
  if (updates.length === 0) return 0;
  const updatedList: Product[] = updates.map(({ existing, incoming }) =>
    stripUndefined({
      ...existing,
      ...(incoming.buyingPrice > 0 ? { buyingPrice: Number(incoming.buyingPrice) } : {}),
      ...(incoming.sellingPrice > 0 ? { sellingPrice: Number(incoming.sellingPrice) } : {}),
      ...(incoming.wholesalePrice > 0 ? { wholesalePrice: Number(incoming.wholesalePrice) } : {}),
      ...(incoming.vipPrice > 0 ? { vipPrice: Number(incoming.vipPrice) } : {}),
      ...(incoming.currentStock !== undefined && incoming.currentStock !== ''
        ? { currentStock: Math.max(0, Number(incoming.currentStock)) }
        : {}),
      ...(incoming.category ? { category: String(incoming.category) } : {}),
      ...(incoming.batchNumber ? { batchNumber: String(incoming.batchNumber) } : {}),
      ...(incoming.expiryDate ? { expiryDate: String(incoming.expiryDate) } : {}),
    })
  );

  await localDb.products.bulkPut(updatedList);
  if (navigator.onLine) {
    await Promise.all(
      updatedList.map((prod) =>
        setDoc(doc(db, `tenants/${tenantId}/products`, prod.id), prod).catch(async () => {
          await localDb.syncQueue.add({
            tenantId,
            table: 'products',
            action: 'update',
            data: prod,
            status: 'pending',
            createdAt: Date.now(),
          });
        })
      )
    );
  } else {
    await localDb.syncQueue.bulkAdd(
      updatedList.map((prod) => ({
        tenantId,
        table: 'products' as const,
        action: 'update' as const,
        data: prod,
        status: 'pending' as const,
        createdAt: Date.now(),
      }))
    );
  }
  return updatedList.length;
}
