import Dexie, { type Table } from 'dexie';
import {
  AIChatMessage,
  AuditLog,
  BillingHistory,
  Branch,
  CreditPayment,
  Customer,
  Expense,
  PayrollRun,
  Product,
  PurchaseOrder,
  RegisterShift,
  Sale,
  StockAdjustment,
  StockTransfer,
  Supplier,
  SyncRecord,
  TenantMember,
} from '../types';

export class PrimeBMSDatabase extends Dexie {
  products!: Table<Product>;
  sales!: Table<Sale>;
  customers!: Table<Customer>;
  expenses!: Table<Expense>;
  suppliers!: Table<Supplier>;
  branches!: Table<Branch>;
  shifts!: Table<RegisterShift>;
  purchaseOrders!: Table<PurchaseOrder>;
  creditPayments!: Table<CreditPayment>;
  members!: Table<TenantMember>;
  billingHistory!: Table<BillingHistory>;
  stockTransfers!: Table<StockTransfer>;
  stockAdjustments!: Table<StockAdjustment>;
  payrollRuns!: Table<PayrollRun>;
  auditLogs!: Table<AuditLog>;
  aiChats!: Table<AIChatMessage>;
  syncQueue!: Table<SyncRecord>;

  constructor() {
    super('PrimeBMSDatabase');
    this.version(4).stores({
      products: 'id, tenantId, name, sku, barcode, category',
      sales: 'id, tenantId, branchId, shiftId, reference, customerId, userId, status, createdAt',
      customers: 'id, tenantId, name, phone',
      expenses: 'id, tenantId, branchId, category, expenseDate',
      suppliers: 'id, tenantId, name, phone, category',
      branches: 'id, tenantId, name, status',
      shifts: 'id, tenantId, branchId, userId, status, openedAt',
      purchaseOrders: 'id, tenantId, branchId, supplierId, status, createdAt',
      creditPayments: 'id, tenantId, partyType, partyId, createdAt',
      members: 'uid, tenantId, email, role, branchId, status',
      syncQueue: '++id, table, action, status, createdAt',
    });

    this.version(5).stores({
      products: 'id, tenantId, name, sku, barcode, category, expiryDate',
      sales: 'id, tenantId, branchId, shiftId, reference, customerId, userId, status, createdAt',
      customers: 'id, tenantId, name, phone',
      expenses: 'id, tenantId, branchId, category, expenseDate',
      suppliers: 'id, tenantId, name, phone, category',
      branches: 'id, tenantId, name, status',
      shifts: 'id, tenantId, branchId, userId, status, openedAt',
      purchaseOrders: 'id, tenantId, branchId, supplierId, status, createdAt',
      creditPayments: 'id, tenantId, partyType, partyId, createdAt',
      members: 'uid, tenantId, email, role, branchId, status',
      billingHistory: 'id, tenantId, createdAt',
      stockTransfers: 'id, tenantId, productId, fromBranchId, toBranchId, createdAt',
      stockAdjustments: 'id, tenantId, branchId, productId, reason, createdAt',
      payrollRuns: 'id, tenantId, branchId, periodLabel, createdAt',
      auditLogs: 'id, tenantId, branchId, actorId, entityType, createdAt',
      aiChats: 'id, tenantId, userId, createdAt',
      syncQueue: '++id, tenantId, table, action, status, createdAt',
    });
  }
}

export const localDb = new PrimeBMSDatabase();

export async function clearAllLocalData(): Promise<void> {
  await Promise.all(localDb.tables.map((t) => t.clear()));
}
