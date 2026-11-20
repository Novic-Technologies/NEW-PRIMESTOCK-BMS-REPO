export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  category: string;
  currentBalance?: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export type BusinessRole = 'admin' | 'manager' | 'cashier' | 'accountant' | 'inventory';

export type AppSection =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'payroll'
  | 'reports'
  | 'shifts'
  | 'ai'
  | 'team'
  | 'billing'
  | 'settings';

export interface User {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: BusinessRole;
  allowedSections?: AppSection[];
  tenantId: string;
  branchId?: string;
  inviteId?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface TenantMember {
  uid: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  role: BusinessRole;
  allowedSections?: AppSection[];
  branchId?: string;
  baseSalaryUgx?: number;
  nssfNumber?: string;
  tinNumber?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  phone?: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface StaffInvite {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: BusinessRole;
  allowedSections?: AppSection[];
  branchId?: string;
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  createdAt: string;
}

export interface TenantPreferences {
  mtnMomoEnabled?: boolean;
  mtnMerchantCode?: string;
  airtelMoneyEnabled?: boolean;
  airtelMerchantCode?: string;
  whatsappReceipts?: boolean;
  thermalPrinterName?: string;
  twoFactorRequired?: boolean;
  staffPinsEnabled?: boolean;
  receiptFooter?: string;
  taxEnabled?: boolean;
  taxRate?: number;
  taxInclusive?: boolean;
}

export interface BillingPaymentMethod {
  id: string;
  type: 'mtn_momo' | 'airtel_money' | 'bank_transfer' | 'card';
  label: string;
  accountRef: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface TenantBranding {
  primaryColor?: string;
  accentColor?: string;
  secondaryAccentColor?: string;
  tagline?: string;
  receiptHeader?: string;
  supportPhone?: string;
  supportEmail?: string;
  website?: string;
  presetId?: string;
}

export interface Tenant {
  id: string;
  name: string;
  logo?: string;
  tin?: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerPhone?: string;
  plan: 'micro' | 'starter' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'trial' | 'pending_approval';
  trialEndsAt: string;
  subscribedAt?: string;
  subscriptionEndsAt?: string;
  locked?: boolean;
  isComplimentary?: boolean;
  complimentaryNote?: string;
  customPriceUgx?: number;
  disabledReason?: string;
  autoRemindersEnabled?: boolean;
  lastAutoReminderAt?: string;
  pendingPlan?: 'micro' | 'starter' | 'business' | 'enterprise';
  pendingAmountUgx?: number;
  pendingPaymentMethod?: string;
  pendingPaymentRef?: string;
  pendingTransactionId?: string;
  pendingPayerPhone?: string;
  pendingInvoiceId?: string;
  pendingSubmittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lastReminderAt?: string;
  lastReminderMessage?: string;
  lastReminderChannel?: string;
  createdAt: string;
  branding?: TenantBranding;
  preferences?: TenantPreferences;
  billingPaymentMethods?: BillingPaymentMethod[];
}

export interface AppNotification {
  id: string;
  tenantId: string;
  title: string;
  message: string;
  category: 'billing' | 'stock' | 'expiry' | 'system' | 'whatsapp';
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  actionRoute?: string;
  channel?: 'in_app' | 'email' | 'whatsapp' | 'all';
  createdAt: string;
  readAt?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  vipPrice?: number;
  currentStock: number;
  branchStock?: Record<string, number>;
  minStockLevel: number;
  unit: string;
  batchNumber?: string;
  expiryDate?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  costPrice?: number;
  total: number;
}

export interface SplitPaymentPart {
  method: string;
  amount: number;
}

export interface Sale {
  id: string;
  tenantId: string;
  branchId?: string;
  branchName?: string;
  shiftId?: string;
  reference: string;
  customerId?: string;
  userId: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  taxAmount?: number;
  taxRate?: number;
  total: number;
  paymentMethod: string;
  paymentProvider?: string;
  paymentReference?: string;
  payerPhone?: string;
  cashTendered?: number;
  changeGiven?: number;
  splitPayments?: SplitPaymentPart[];
  status: 'completed' | 'pending' | 'refunded';
  refundedAt?: string;
  refundReason?: string;
  createdAt: string;
}

export interface RegisterShift {
  id: string;
  tenantId: string;
  branchId?: string;
  userId: string;
  userName: string;
  openingFloat: number;
  expectedCash: number;
  closingCash?: number;
  variance?: number;
  cashSales: number;
  mobileMoneySales: number;
  cardSales: number;
  creditSales: number;
  salesCount: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  notes?: string;
}

export interface PurchaseOrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  branchId?: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'ordered' | 'received' | 'cancelled';
  expectedDate?: string;
  receivedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface CreditPayment {
  id: string;
  tenantId: string;
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  type: 'Individual' | 'Business' | 'Wholesale' | 'VIP';
  creditLimit: number;
  currentBalance: number;
  loyaltyPoints: number;
  createdAt: string;
}

export interface Expense {
  id: string;
  tenantId: string;
  branchId?: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
  recordedBy: string;
  createdAt: string;
}

export interface BillingHistory {
  id: string;
  tenantId: string;
  plan?: string;
  amount: number;
  paymentMethod?: string;
  provider?: string;
  payerPhone?: string;
  status: string;
  reference: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface SubscriptionReminder {
  id: string;
  tenantId: string;
  message: string;
  channel: 'in_app' | 'email' | 'whatsapp';
  sentBy: string;
  sentByEmail: string;
  acknowledged?: boolean;
  createdAt: string;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  quantity: number;
  notes?: string;
  status: 'completed';
  transferredBy: string;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  tenantId: string;
  branchId?: string;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  delta: number;
  reason: 'Stock-Take' | 'Damaged' | 'Expired' | 'Theft/Loss' | 'Return' | 'Correction';
  notes?: string;
  adjustedBy: string;
  adjustedByName: string;
  createdAt: string;
}

export interface PayrollEntry {
  memberUid: string;
  memberName: string;
  role: string;
  grossSalaryUgx: number;
  payeTaxUgx: number;
  nssfEmployeeUgx: number;
  nssfEmployerUgx: number;
  netPayUgx: number;
}

export interface PayrollRun {
  id: string;
  tenantId: string;
  branchId?: string;
  periodLabel: string;
  paymentMethod: string;
  entries: PayrollEntry[];
  totalGrossUgx: number;
  totalPayeUgx: number;
  totalNssfEmployeeUgx: number;
  totalNssfEmployerUgx: number;
  totalNetPayUgx: number;
  processedBy: string;
  processedByName: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  branchId?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
}

export interface AIChatMessage {
  id: string;
  tenantId: string;
  userId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export type SyncTable =
  | 'products'
  | 'sales'
  | 'customers'
  | 'expenses'
  | 'suppliers'
  | 'branches'
  | 'shifts'
  | 'purchaseOrders'
  | 'creditPayments'
  | 'billingHistory'
  | 'stockTransfers'
  | 'stockAdjustments'
  | 'payrollRuns'
  | 'auditLogs'
  | 'aiChats';

export interface SyncRecord {
  id?: number;
  tenantId: string;
  table: SyncTable;
  action: 'create' | 'update' | 'delete';
  data: any;
  status: 'pending' | 'synced' | 'error';
  createdAt: number;
}

export interface RestockRecommendation {
  productId: string;
  productName: string;
  urgency: 'critical' | 'soon' | 'watch';
  estimatedDaysLeft: number;
  suggestedOrderQty: number;
  estimatedCostUgx: number;
  reason: string;
}

export interface DeadStockInsight {
  productId: string;
  productName: string;
  capitalTiedUgx: number;
  marginPercent: number;
  recommendation: string;
  suggestedPromoPriceUgx: number;
}

export interface DeadStockMarginResult {
  summary: string;
  totalCapitalTiedUgx: number;
  insights: DeadStockInsight[];
}

export interface DebtReminderResult {
  message: string;
  tone: 'friendly' | 'firm' | 'final';
}

export interface EodDigestResult {
  headline: string;
  highlights: string[];
  actionForTomorrow: string;
}

export interface ScannedDocumentResult {
  vendorName?: string;
  description?: string;
  documentDate?: string;
  reference?: string;
  category?: string;
  paymentMethod?: string;
  taxAmount?: number;
  totalAmount?: number;
  items?: Array<{
    name: string;
    quantity: number;
    unitCost: number;
    total: number;
  }>;
}
