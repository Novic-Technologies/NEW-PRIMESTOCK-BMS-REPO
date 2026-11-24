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
  | 'bulk_import'
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
  posPinHash?: string;
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

export type ThemePreference = 'light' | 'dark' | 'system';

export interface TenantPreferences {
  mtnMomoEnabled?: boolean;
  mtnMerchantCode?: string;
  airtelMoneyEnabled?: boolean;
  airtelMerchantCode?: string;
  whatsappReceipts?: boolean;
  thermalPrinterName?: string;
  thermalPrintMode?: 'serial' | 'bluetooth' | 'rawbt' | 'browser';
  cashDrawerKickEnabled?: boolean;
  staffPinsEnabled?: boolean;
  receiptFooter?: string;
  taxEnabled?: boolean;
  taxRate?: number;
  taxInclusive?: boolean;
  efrisEnabled?: boolean;
  efrisDeviceNo?: string;
  efrisSandbox?: boolean;
  loyaltyEnabled?: boolean;
  loyaltyPointsPerUgx?: number;
  loyaltyUgxPerPoint?: number;
}

export interface BillingPaymentMethod {
  id: string;
  type: 'mtn_momo' | 'airtel_money' | 'bank_transfer' | 'card';
  label: string;
  accountRef: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface PlatformPaymentChannelConfig {
  id: 'mtn_momo' | 'airtel_money' | 'flutterwave' | 'bank_transfer' | string;
  label: string;
  paymentMethodName: string;
  sublabel: string;
  enabled: boolean;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  ussdPrefix?: string;
  instructions?: string;
}

export interface PlatformBillingConfig {
  id: 'billing';
  channels: PlatformPaymentChannelConfig[];
  supportPhone?: string;
  supportEmail?: string;
  supportWhatsapp?: string;
  updatedAt: string;
  updatedBy?: string;
}

export type TierFeatureKey =
  | 'whatsappReceipts'
  | 'suppliersAndPOs'
  | 'advancedReports'
  | 'multiBranchTransfers'
  | 'payrollPayeNssf'
  | 'aiRestockAndMargin';

export interface PlatformPlanTierConfig {
  id: Tenant['plan'];
  name: string;
  monthlyPriceUgx: number;
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  aiDailyAllowance: number;
  features: Record<TierFeatureKey, boolean>;
  highlights: string[];
  allowedUpgradeTargets: Array<Tenant['plan']>;
}

export interface PlatformPlansConfig {
  id: 'plans';
  defaultSignupPlan: Tenant['plan'];
  trialDays: number;
  reminderLeadDays: number;
  strictEnforcement: boolean;
  autoLockExpired: boolean;
  multiMonthDiscounts: {
    m1: number;
    m3: number;
    m6: number;
    m12: number;
  };
  upgradeHeadline?: string;
  tiers: Record<Tenant['plan'], PlatformPlanTierConfig>;
  updatedAt: string;
  updatedBy?: string;
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
  status: 'active' | 'suspended' | 'locked' | 'trial' | 'pending_approval';
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
  legalAcceptedAt?: string;
  legalVersion?: string;
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

export interface ProductBatch {
  id: string;
  batchNumber: string;
  expiryDate?: string;
  quantity: number;
  branchId?: string;
  unitCost?: number;
  receivedAt?: string;
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
  batches?: ProductBatch[];
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
  cashierId?: string;
  cashierName?: string;
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
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountUgx?: number;
  efrisFdn?: string;
  efrisVerificationCode?: string;
  efrisQrData?: string;
  efrisFiscalizedAt?: string;
  efrisStatus?: 'fiscalized' | 'sandbox' | 'pending' | 'failed';
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
  receivedQuantity?: number;
  unitCost: number;
  total: number;
}

export interface PurchaseOrderGrnEntry {
  id: string;
  receivedAt: string;
  receivedBy: string;
  receivedByName?: string;
  notes?: string;
  items: Array<{
    productId: string;
    name: string;
    quantityReceived: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  branchId?: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  currency?: 'UGX' | 'USD' | 'KES';
  exchangeRateToUgx?: number;
  foreignTotalAmount?: number;
  items: PurchaseOrderItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'ordered' | 'partially_received' | 'received' | 'cancelled';
  expectedDate?: string;
  receivedAt?: string;
  grnHistory?: PurchaseOrderGrnEntry[];
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
  gatewayVerified?: boolean;
  gatewayTxId?: string;
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
  status: 'in_transit' | 'completed' | 'cancelled';
  transferredBy: string;
  dispatchedAt?: string;
  receivedAt?: string;
  receivedBy?: string;
  receivedByName?: string;
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
  errorMessage?: string;
  retryCount?: number;
  lastAttemptAt?: number;
  createdAt: number;
}

export interface AIUsageRecord {
  id: string;
  tenantId: string;
  dateKey: string;
  count: number;
  lastAction?: string;
  updatedAt: string;
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

export type SmartImportEntityType =
  | 'products'
  | 'sales'
  | 'refunds'
  | 'suppliers'
  | 'customers'
  | 'purchases'
  | 'expenses';

export interface SmartImportFieldMapping {
  sourceHeader: string;
  targetField: string;
  confidence?: 'high' | 'medium' | 'low';
}

export type SmartImportReconcileAction = 'create' | 'update' | 'link' | 'conflict' | 'skip';

export interface SmartImportReconciledRow {
  rowIndex: number;
  action: SmartImportReconcileAction;
  matchedRecordId?: string;
  matchedRecordLabel?: string;
  matchReason?: string;
  conflictFields?: Array<{ field: string; existingValue: any; incomingValue: any }>;
  resolution?: 'overwrite' | 'keep_existing' | 'create_new';
  data: Record<string, any>;
}

export interface SmartImportTableBatch {
  tableId: string;
  sectionTitle: string;
  entityType: SmartImportEntityType;
  pageRange: string;
  sourceHeaders: string[];
  fieldMappings: SmartImportFieldMapping[];
  rows: Array<Record<string, any>>;
  rawSpreadsheetRows?: Array<Record<string, any>>;
  warnings: string[];
}

export interface SmartImportSkippedTable {
  sectionTitle: string;
  pageRange: string;
  reason: string;
  rowCount: number;
}

export interface SmartImportExtractResult {
  entityType: SmartImportEntityType;
  detectedEntityType?: SmartImportEntityType;
  detectionConfidence?: 'high' | 'medium' | 'low';
  detectionReason?: string;
  detectedFormat: string;
  summary: string;
  sourceHeaders: string[];
  fieldMappings: SmartImportFieldMapping[];
  rows: Array<Record<string, any>>;
  rawSpreadsheetRows?: Array<Record<string, any>>;
  warnings: string[];
  multiTables?: SmartImportTableBatch[];
  skippedTables?: SmartImportSkippedTable[];
}

export interface SmartStocktakeItemResult {
  productId: string;
  productName: string;
  countedQty: number;
  systemQty: number;
  variance: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export interface SmartStocktakeResult {
  summary: string;
  items: SmartStocktakeItemResult[];
}

export interface ParsedOrderDraftResult {
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    confidence: 'high' | 'medium' | 'low';
    notes?: string;
  }>;
  matchedCustomerId?: string;
  matchedCustomerName?: string;
  paymentMethod?: string;
  isCredit?: boolean;
  reason: string;
}

export interface MomoMatchResult {
  txId: string;
  provider: string;
  amountUgx: number;
  payerPhone?: string;
  payerName?: string;
  matchType: 'pending_sale' | 'customer_credit' | 'unmatched';
  matchedId?: string;
  matchedLabel?: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface WhatsappReplyDraftResult {
  replyText: string;
  language: 'en' | 'lg' | 'sw';
  referencedProducts: Array<{
    productName: string;
    priceUgx: number;
    inStock: number;
  }>;
  reason: string;
}

export interface InvoiceCheckResult {
  summary: string;
  discrepancies: Array<{
    itemName: string;
    poQty: number;
    invoiceQty: number;
    poUnitCostUgx: number;
    invoiceUnitCostUgx: number;
    status: 'matched' | 'overcharge' | 'short_delivery' | 'extra_item';
    reason: string;
  }>;
}

export interface EnrichedProductSuggestion {
  productId?: string;
  originalName: string;
  standardizedName: string;
  suggestedCategory: string;
  suggestedSku: string;
  suggestedUnit?: string;
  description: string;
  reason: string;
}

export interface GuidedSetupSuggestion {
  businessSummary: string;
  recommendedCategories: string[];
  recommendedUnits: string[];
  pricingRuleSuggestion: string;
  roleSuggestions: Array<{ role: BusinessRole; tip: string }>;
  reason: string;
}

export interface MasterTriageResult {
  category: 'billing' | 'quota_upgrade' | 'technical' | 'onboarding' | 'account';
  urgency: 'high' | 'medium' | 'low';
  suggestedPlan?: Tenant['plan'];
  draftReply: string;
  reason: string;
}

