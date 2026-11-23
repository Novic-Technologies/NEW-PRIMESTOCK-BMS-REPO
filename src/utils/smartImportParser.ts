import { SmartImportEntityType, SmartImportExtractResult, SmartImportFieldMapping } from '../types';

export interface SmartFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  required?: boolean;
  options?: string[];
  aliases: string[];
}

export interface SmartEntityConfig {
  entityType: SmartImportEntityType;
  title: string;
  description: string;
  sampleFilename: string;
  sampleHeaders: string[];
  sampleRow: Array<string | number>;
  fields: SmartFieldDefinition[];
}

export const SMART_ENTITY_CONFIGS: Record<SmartImportEntityType, SmartEntityConfig> = {
  products: {
    entityType: 'products',
    title: 'Products & Inventory',
    description: 'Import stock catalogs, supplier price lists, or product spreadsheets.',
    sampleFilename: 'primestock-products-template.csv',
    sampleHeaders: [
      'name',
      'category',
      'sku',
      'barcode',
      'buyingPrice',
      'sellingPrice',
      'wholesalePrice',
      'vipPrice',
      'currentStock',
      'minStockLevel',
      'unit',
      'batchNumber',
      'expiryDate',
    ],
    sampleRow: [
      'Sugar Kakira 1kg',
      'Groceries',
      'SUG-001',
      '6001234567890',
      3800,
      4500,
      4200,
      4100,
      50,
      10,
      'kg',
      'B-01',
      '2027-06-30',
    ],
    fields: [
      {
        key: 'name',
        label: 'Product Name',
        type: 'text',
        required: true,
        aliases: ['name', 'product', 'product name', 'productname', 'item', 'item name', 'itemname', 'description', 'title', 'goods'],
      },
      {
        key: 'category',
        label: 'Category',
        type: 'text',
        aliases: ['category', 'cat', 'group', 'department', 'class'],
      },
      {
        key: 'sku',
        label: 'SKU',
        type: 'text',
        aliases: ['sku', 'code', 'item code', 'product code', 'ref'],
      },
      {
        key: 'barcode',
        label: 'Barcode',
        type: 'text',
        aliases: ['barcode', 'ean', 'upc', 'gtin'],
      },
      {
        key: 'buyingPrice',
        label: 'Buying Price',
        type: 'number',
        aliases: ['buyingprice', 'buying price', 'cost', 'cost price', 'unit cost', 'bp', 'purchase price'],
      },
      {
        key: 'sellingPrice',
        label: 'Selling Price',
        type: 'number',
        required: true,
        aliases: ['sellingprice', 'selling price', 'retail price', 'retail', 'sp', 'unit price', 'selling', 'price', 'rate'],
      },
      {
        key: 'wholesalePrice',
        label: 'Wholesale Price',
        type: 'number',
        aliases: ['wholesaleprice', 'wholesale price', 'wholesale', 'whl'],
      },
      {
        key: 'vipPrice',
        label: 'VIP Price',
        type: 'number',
        aliases: ['vipprice', 'vip price', 'vip'],
      },
      {
        key: 'currentStock',
        label: 'Quantity / Stock',
        type: 'number',
        aliases: ['currentstock', 'current stock', 'stock', 'qty', 'quantity', 'on hand', 'balance', 'units', 'count'],
      },
      {
        key: 'minStockLevel',
        label: 'Min Stock Alert',
        type: 'number',
        aliases: ['minstocklevel', 'min stock', 'reorder', 'reorder level', 'reorder lvl', 'min level', 'min'],
      },
      {
        key: 'unit',
        label: 'Unit',
        type: 'text',
        aliases: ['unit', 'uom', 'measure', 'pack'],
      },
      {
        key: 'batchNumber',
        label: 'Batch #',
        type: 'text',
        aliases: ['batchnumber', 'batch', 'lot', 'batch no', 'batch number'],
      },
      {
        key: 'expiryDate',
        label: 'Expiry Date',
        type: 'date',
        aliases: ['expirydate', 'expiry', 'exp', 'best before', 'exp date', 'expiry date'],
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['active', 'inactive'],
        aliases: ['status', 'state'],
      },
    ],
  },
  customers: {
    entityType: 'customers',
    title: 'Customers & Credit Ledger',
    description: 'Import client directories, phone books, wholesale buyers, and opening balances.',
    sampleFilename: 'primestock-customers-template.csv',
    sampleHeaders: ['name', 'phone', 'email', 'address', 'type', 'creditLimit', 'currentBalance', 'loyaltyPoints'],
    sampleRow: ['Nakato Sarah', '0772112233', 'sarah@example.com', 'Kampala Road', 'Wholesale', 500000, 120000, 45],
    fields: [
      {
        key: 'name',
        label: 'Customer Name',
        type: 'text',
        required: true,
        aliases: ['name', 'customer', 'customer name', 'client', 'full name', 'company'],
      },
      {
        key: 'phone',
        label: 'Phone (10+ digits)',
        type: 'text',
        required: true,
        aliases: ['phone', 'tel', 'telephone', 'mobile', 'contact', 'whatsapp', 'phone number'],
      },
      {
        key: 'email',
        label: 'Email',
        type: 'text',
        aliases: ['email', 'e mail', 'mail'],
      },
      {
        key: 'address',
        label: 'Address / Location',
        type: 'text',
        aliases: ['address', 'location', 'area', 'town', 'city'],
      },
      {
        key: 'type',
        label: 'Customer Type',
        type: 'select',
        options: ['Individual', 'Business', 'Wholesale', 'VIP'],
        aliases: ['type', 'tier', 'category', 'segment'],
      },
      {
        key: 'creditLimit',
        label: 'Credit Limit',
        type: 'number',
        aliases: ['creditlimit', 'credit limit', 'limit'],
      },
      {
        key: 'currentBalance',
        label: 'Opening Debt',
        type: 'number',
        aliases: ['currentbalance', 'owing', 'amount owed', 'balance', 'debt', 'owed', 'opening balance', 'credit balance'],
      },
      {
        key: 'loyaltyPoints',
        label: 'Loyalty Points',
        type: 'number',
        aliases: ['loyaltypoints', 'points', 'loyalty'],
      },
    ],
  },
  suppliers: {
    entityType: 'suppliers',
    title: 'Suppliers & Vendors',
    description: 'Import wholesalers, distributors, farmers, and payable balances.',
    sampleFilename: 'primestock-suppliers-template.csv',
    sampleHeaders: ['name', 'contactPerson', 'phone', 'email', 'address', 'category', 'currentBalance', 'status'],
    sampleRow: ['Kampala Distributors Ltd', 'Musoke Peter', '0752445566', 'orders@kdl.ug', 'Industrial Area', 'Distributor', 250000, 'active'],
    fields: [
      {
        key: 'name',
        label: 'Supplier / Business',
        type: 'text',
        required: true,
        aliases: ['name', 'supplier', 'vendor', 'company', 'business name', 'supplier name'],
      },
      {
        key: 'contactPerson',
        label: 'Contact Person',
        type: 'text',
        aliases: ['contactperson', 'contact person', 'rep', 'manager'],
      },
      {
        key: 'phone',
        label: 'Phone (10+ digits)',
        type: 'text',
        required: true,
        aliases: ['phone', 'tel', 'mobile', 'telephone', 'phone number'],
      },
      {
        key: 'email',
        label: 'Email',
        type: 'text',
        aliases: ['email', 'mail'],
      },
      {
        key: 'address',
        label: 'Address',
        type: 'text',
        aliases: ['address', 'location', 'area'],
      },
      {
        key: 'category',
        label: 'Category',
        type: 'text',
        aliases: ['category', 'type', 'sector'],
      },
      {
        key: 'currentBalance',
        label: 'Payable Balance',
        type: 'number',
        aliases: ['currentbalance', 'balance owed', 'amount owed', 'balance', 'payable', 'owed'],
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['active', 'inactive'],
        aliases: ['status', 'state'],
      },
    ],
  },
  sales: {
    entityType: 'sales',
    title: 'Sales & Receipts',
    description: 'Import daily sales sheets, POS exports, or receipt photos/PDFs.',
    sampleFilename: 'primestock-sales-template.csv',
    sampleHeaders: ['reference', 'saleDate', 'customerName', 'customerPhone', 'itemName', 'quantity', 'unitPrice', 'discount', 'total', 'paymentMethod', 'status'],
    sampleRow: ['SALE-1001', '2026-03-15', 'Walk-in', '', 'Sugar Kakira 1kg', 4, 4500, 0, 18000, 'Cash', 'completed'],
    fields: [
      {
        key: 'reference',
        label: 'Receipt Ref',
        type: 'text',
        aliases: ['reference', 'ref', 'invoice', 'invoice no', 'inv no', 'receipt', 'receipt no', 'sale id'],
      },
      {
        key: 'saleDate',
        label: 'Sale Date',
        type: 'date',
        aliases: ['saledate', 'sale date', 'date', 'createdat', 'timestamp'],
      },
      {
        key: 'customerName',
        label: 'Customer',
        type: 'text',
        aliases: ['customername', 'customer', 'customer name', 'buyer', 'client'],
      },
      {
        key: 'customerPhone',
        label: 'Customer Phone',
        type: 'text',
        aliases: ['customerphone', 'customer phone', 'phone', 'tel'],
      },
      {
        key: 'itemName',
        label: 'Item / Description',
        type: 'text',
        required: true,
        aliases: ['itemname', 'product', 'item', 'item name', 'description', 'items'],
      },
      {
        key: 'sku',
        label: 'SKU',
        type: 'text',
        aliases: ['sku', 'code'],
      },
      {
        key: 'quantity',
        label: 'Qty',
        type: 'number',
        aliases: ['quantity', 'qty', 'units'],
      },
      {
        key: 'unitPrice',
        label: 'Unit Price',
        type: 'number',
        aliases: ['unitprice', 'unit price', 'price', 'rate'],
      },
      {
        key: 'discount',
        label: 'Discount',
        type: 'number',
        aliases: ['discount', 'disc'],
      },
      {
        key: 'total',
        label: 'Total (UGX)',
        type: 'number',
        required: true,
        aliases: ['total', 'line total', 'amount', 'grand total', 'net total', 'subtotal'],
      },
      {
        key: 'paymentMethod',
        label: 'Payment Method',
        type: 'select',
        options: ['Cash', 'MTN Mobile Money', 'Airtel Money', 'Card', 'Bank Transfer', 'Customer Credit'],
        aliases: ['paymentmethod', 'payment method', 'method', 'payment', 'mode'],
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['completed', 'pending'],
        aliases: ['status', 'state'],
      },
    ],
  },
  refunds: {
    entityType: 'refunds',
    title: 'Refunds & Returns',
    description: 'Import customer return notes, voided receipts, or refund logs.',
    sampleFilename: 'primestock-refunds-template.csv',
    sampleHeaders: ['reference', 'refundDate', 'customerName', 'itemName', 'quantity', 'total', 'paymentMethod', 'refundReason'],
    sampleRow: ['SALE-1001', '2026-03-16', 'John Okello', 'Cooking Oil 5L', 1, 42000, 'Cash', 'Damaged seal'],
    fields: [
      {
        key: 'reference',
        label: 'Original Receipt Ref',
        type: 'text',
        aliases: ['invoice', 'invoice no', 'reference', 'ref', 'receipt', 'sale ref'],
      },
      {
        key: 'refundDate',
        label: 'Refund Date',
        type: 'date',
        aliases: ['refunddate', 'refund date', 'date', 'returned at'],
      },
      {
        key: 'customerName',
        label: 'Customer',
        type: 'text',
        aliases: ['customername', 'customer', 'client'],
      },
      {
        key: 'itemName',
        label: 'Returned Item',
        type: 'text',
        required: true,
        aliases: ['itemname', 'product', 'item', 'description'],
      },
      {
        key: 'quantity',
        label: 'Qty Returned',
        type: 'number',
        aliases: ['quantity', 'qty', 'units'],
      },
      {
        key: 'total',
        label: 'Refund Amount (UGX)',
        type: 'number',
        required: true,
        aliases: ['total', 'refund amount', 'amount', 'value'],
      },
      {
        key: 'paymentMethod',
        label: 'Refund Method',
        type: 'select',
        options: ['Cash', 'MTN Mobile Money', 'Airtel Money', 'Bank Transfer', 'Customer Credit'],
        aliases: ['refunded via', 'refund method', 'paymentmethod', 'payment method', 'method', 'payment'],
      },
      {
        key: 'refundReason',
        label: 'Reason',
        type: 'text',
        required: true,
        aliases: ['refundreason', 'reason', 'notes', 'comment'],
      },
    ],
  },
  purchases: {
    entityType: 'purchases',
    title: 'Purchases & Supplier Orders',
    description: 'Import supplier invoices, restock spreadsheets, PDFs, or delivery notes.',
    sampleFilename: 'primestock-purchases-template.csv',
    sampleHeaders: ['reference', 'supplierName', 'supplierPhone', 'itemName', 'sku', 'quantity', 'unitCost', 'totalAmount', 'paidAmount', 'status', 'expectedDate', 'notes'],
    sampleRow: ['PO-2041', 'Kampala Distributors Ltd', '0752445566', 'Sugar Kakira 1kg', 'SUG-001', 20, 3800, 76000, 76000, 'ordered', '2026-03-20', 'Weekly restock'],
    fields: [
      {
        key: 'reference',
        label: 'PO / Invoice Ref',
        type: 'text',
        aliases: ['po no', 'po number', 'reference', 'ref', 'po', 'invoice', 'invoice no'],
      },
      {
        key: 'supplierName',
        label: 'Supplier Name',
        type: 'text',
        required: true,
        aliases: ['suppliername', 'supplier', 'supplier name', 'vendor', 'wholesaler'],
      },
      {
        key: 'supplierPhone',
        label: 'Supplier Phone',
        type: 'text',
        aliases: ['supplierphone', 'supplier phone', 'phone', 'tel'],
      },
      {
        key: 'itemName',
        label: 'Product / Item',
        type: 'text',
        required: true,
        aliases: ['itemname', 'product', 'item', 'description'],
      },
      {
        key: 'sku',
        label: 'SKU',
        type: 'text',
        aliases: ['sku', 'code'],
      },
      {
        key: 'quantity',
        label: 'Qty',
        type: 'number',
        required: true,
        aliases: ['quantity', 'qty', 'units'],
      },
      {
        key: 'unitCost',
        label: 'Unit Cost',
        type: 'number',
        aliases: ['unitcost', 'unit cost', 'cost', 'buyingprice', 'rate'],
      },
      {
        key: 'totalAmount',
        label: 'Total Amount',
        type: 'number',
        aliases: ['totalamount', 'total amount', 'line total', 'total', 'amount'],
      },
      {
        key: 'paidAmount',
        label: 'Paid Amount',
        type: 'number',
        aliases: ['paidamount', 'paid amount', 'paid', 'payment', 'payment status'],
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['ordered', 'received'],
        aliases: ['status', 'delivery', 'delivery status', 'state'],
      },
      {
        key: 'expectedDate',
        label: 'Date',
        type: 'date',
        aliases: ['expecteddate', 'expected date', 'date', 'delivery date'],
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'text',
        aliases: ['notes', 'remarks', 'memo'],
      },
    ],
  },
  expenses: {
    entityType: 'expenses',
    title: 'Expenses & Bills',
    description: 'Import rent, UMEME, NWSC, transport, or petty cash expense sheets and receipt scans.',
    sampleFilename: 'primestock-expenses-template.csv',
    sampleHeaders: ['expenseDate', 'category', 'description', 'amount', 'paymentMethod'],
    sampleRow: ['2026-03-15', 'Utilities', 'UMEME Yaka Electricity Token', 150000, 'Mobile Money'],
    fields: [
      {
        key: 'expenseDate',
        label: 'Date',
        type: 'date',
        aliases: ['expensedate', 'expense date', 'date', 'createdat'],
      },
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        options: ['General', 'Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance'],
        aliases: ['category', 'type', 'group'],
      },
      {
        key: 'description',
        label: 'Description',
        type: 'text',
        required: true,
        aliases: ['description', 'expense', 'expense item', 'details', 'item', 'particulars', 'vendor', 'note'],
      },
      {
        key: 'amount',
        label: 'Amount (UGX)',
        type: 'number',
        required: true,
        aliases: ['amount', 'monthly', 'monthly ugx', 'run rate', 'cost', 'total', 'spent'],
      },
      {
        key: 'paymentMethod',
        label: 'Payment Method',
        type: 'select',
        options: ['Cash', 'Mobile Money', 'Bank Transfer', 'Credit Card'],
        aliases: ['paymentmethod', 'payment method', 'method', 'payment', 'mode'],
      },
    ],
  },
};

export function parseFlexibleNumeric(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const str = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ugx|shs|ush|\/=|,/gi, '')
    .trim();
  if (!str) return 0;
  const kMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*k$/i);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const mMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*m$/i);
  if (mMatch) return Math.round(Number(mMatch[1]) * 1000000);
  const cleaned = str.replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeUgPhone(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  const digits = str.replace(/[^\d]/g, '');
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('3') || digits.startsWith('4'))) {
    return `0${digits}`;
  }
  if (digits.startsWith('256') && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('2560') && digits.length === 13) {
    return `0${digits.slice(4)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits;
  }
  return str;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function isBlankPlaceholder(raw: unknown): boolean {
  const str = String(raw ?? '').trim();
  return !str || /^(n\/?a|none|nil|null|tbd|unk|unknown|-+|—)$/i.test(str);
}

function cleanOptionalText(raw: unknown, maxLen: number): string {
  const str = String(raw ?? '').trim();
  if (isBlankPlaceholder(str)) return '';
  return str.slice(0, maxLen);
}

export function normalizePaymentMethod(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Cash';
  const low = s.toLowerCase();
  if (low === 'mtn momo' || low === 'momo' || low === 'mtn' || low.includes('mtn mobile')) {
    return 'MTN Mobile Money';
  }
  if (low === 'airtel' || low.includes('airtel money')) {
    return 'Airtel Money';
  }
  if (low === 'credit' || low === 'credit note' || low.includes('customer credit')) {
    return 'Customer Credit';
  }
  if (low === 'bank' || low === 'eft' || low.includes('bank transfer')) {
    return 'Bank Transfer';
  }
  if (low === 'card' || low.includes('visa') || low.includes('mastercard')) {
    return 'Card';
  }
  if (low === 'cash') return 'Cash';
  return s.slice(0, 64);
}

function inferExpenseCategory(description: string, existingCategory: string): string {
  const cleanCat = cleanOptionalText(existingCategory, 80);
  if (cleanCat && cleanCat.toLowerCase() !== 'general') return cleanCat;
  const desc = description.toLowerCase();
  if (/rent|lease|premises/.test(desc)) return 'Rent';
  if (/salary|salaries|wages|payroll|stipend/.test(desc)) return 'Salaries';
  if (/utilit|power|electric|umeme|yaka|water|nwsc|internet|wifi|airtime/.test(desc)) return 'Utilities';
  if (/market|advert|promo|banner/.test(desc)) return 'Marketing';
  if (/repair|maint|clean|servicing/.test(desc)) return 'Maintenance';
  if (/transport|delivery|fuel|stationer|packaging|suppl/.test(desc)) return 'Supplies';
  return cleanCat || 'General';
}

export function normalizeIsoDate(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (isBlankPlaceholder(str)) {
    return '';
  }
  const isoDirect = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (isoDirect) {
    return `${isoDirect[1]}-${isoDirect[2].padStart(2, '0')}-${isoDirect[3].padStart(2, '0')}`;
  }
  const dMonY = str.match(/^(\d{1,2})[\s\-\/,]+([A-Za-z]+)[\s\-\/,]+(\d{2,4})$/);
  if (dMonY) {
    const mIdx = MONTH_MAP[dMonY[2].toLowerCase()];
    if (mIdx !== undefined) {
      let yr = Number(dMonY[3]);
      if (yr < 100) yr += 2000;
      const day = Number(dMonY[1]);
      if (day >= 1 && day <= 31) {
        return `${yr}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  const monDY = str.match(/^([A-Za-z]+)[\s\-]+(\d{1,2})[\s,]+(\d{2,4})$/);
  if (monDY) {
    const mIdx = MONTH_MAP[monDY[1].toLowerCase()];
    if (mIdx !== undefined) {
      let yr = Number(monDY[3]);
      if (yr < 100) yr += 2000;
      const day = Number(monDY[2]);
      if (day >= 1 && day <= 31) {
        return `${yr}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  const dmyMatch = str.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmyMatch) {
    let a = Number(dmyMatch[1]);
    let b = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) year += 2000;
    if (b > 12 && a <= 12) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
  }
  if (/^\d{5}$/.test(str)) {
    const serial = Number(str);
    if (serial > 25000 && serial < 75000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
    }
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return '';
}

export function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas && semis > 0) return ';';
  return ',';
}

function normalizeClientHeader(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\(ugx\)|\(usd\)|\(w\)|\(r\)|ugx|shs|ush|\/=/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CLIENT_UNCONDITIONAL_IGNORE_RE =
  /^(no\.?|s\/?n|sn|#|index|serial|row|mfg\.?\s*date|manufacture\s*date|manufactured|stock\s*value.*|customer\s*since|last\s*order|units\s*in\s*stock|payment\s*terms|margin.*|potential\s*margin|share|age)$/i;

function shouldIgnoreClientHeader(entityType: SmartImportEntityType, trimmed: string, normalized: string): boolean {
  if (!normalized || CLIENT_UNCONDITIONAL_IGNORE_RE.test(trimmed) || CLIENT_UNCONDITIONAL_IGNORE_RE.test(normalized)) {
    return true;
  }
  if (entityType === 'products' && (normalized === 'supplier' || normalized === 'vendor')) return true;
  if (entityType === 'customers' && /^(id|orders|total sales|refunds|contact person)$/.test(normalized)) return true;
  if (entityType === 'suppliers' && /^(id|products|orders|purchases)$/.test(normalized)) return true;
  if (entityType === 'sales' && /^(tier)$/.test(normalized)) return true;
  if (entityType === 'refunds' && /^(refund|refund id|refund no)$/.test(normalized)) return true;
  if (entityType === 'purchases' && /^(lines|batch|batch no)$/.test(normalized)) return true;
  return false;
}

export function inferFieldMappingsLocally(
  entityType: SmartImportEntityType,
  sourceHeaders: string[]
): SmartImportFieldMapping[] {
  const config = SMART_ENTITY_CONFIGS[entityType];
  const usedTargets = new Set<string>();
  const resolved: SmartImportFieldMapping[] = sourceHeaders.map((header) => ({
    sourceHeader: header,
    targetField: 'ignore',
    confidence: 'low',
  }));

  const normalizedPerIdx = sourceHeaders.map((h) => {
    const trimmed = String(h || '').trim();
    const normalized = normalizeClientHeader(trimmed);
    const ignored = shouldIgnoreClientHeader(entityType, trimmed, normalized);
    return { normalized, ignored };
  });

  // Pass 1: exact alias matches across ALL headers first so weak partial hits never steal required columns
  for (let i = 0; i < sourceHeaders.length; i++) {
    const { normalized, ignored } = normalizedPerIdx[i];
    if (ignored) continue;
    for (const f of config.fields) {
      if (usedTargets.has(f.key)) continue;
      const normKey = normalizeClientHeader(f.key);
      if (normKey === normalized || f.aliases.some((a) => normalizeClientHeader(a) === normalized)) {
        usedTargets.add(f.key);
        resolved[i] = { sourceHeader: sourceHeaders[i], targetField: f.key, confidence: 'high' };
        break;
      }
    }
  }

  // Pass 2: partial alias matches for remaining unmapped >= 3-char headers
  for (let i = 0; i < sourceHeaders.length; i++) {
    if (resolved[i].targetField !== 'ignore') continue;
    const { normalized, ignored } = normalizedPerIdx[i];
    if (ignored || normalized.length < 3) continue;
    for (const f of config.fields) {
      if (usedTargets.has(f.key)) continue;
      const partialHit = f.aliases.some((a) => {
        const na = normalizeClientHeader(a);
        return na.length >= 3 && (normalized.includes(na) || na.includes(normalized));
      });
      if (partialHit) {
        usedTargets.add(f.key);
        resolved[i] = { sourceHeader: sourceHeaders[i], targetField: f.key, confidence: 'medium' };
        break;
      }
    }
  }

  return resolved;
}

export function sanitizeRowForEntity(
  entityType: SmartImportEntityType,
  raw: Record<string, any>
): Record<string, any> {
  switch (entityType) {
    case 'products': {
      const wholesalePrice = Math.max(0, parseFlexibleNumeric(raw.wholesalePrice));
      const parsedSelling = Math.max(0, parseFlexibleNumeric(raw.sellingPrice));
      return {
        name: cleanOptionalText(raw.name, 150),
        category: cleanOptionalText(raw.category, 80) || 'General',
        sku: cleanOptionalText(raw.sku, 64),
        barcode: cleanOptionalText(raw.barcode, 64),
        buyingPrice: Math.max(0, parseFlexibleNumeric(raw.buyingPrice)),
        sellingPrice: parsedSelling > 0 ? parsedSelling : wholesalePrice,
        wholesalePrice,
        vipPrice: Math.max(0, parseFlexibleNumeric(raw.vipPrice)),
        currentStock: Math.max(0, parseFlexibleNumeric(raw.currentStock)),
        minStockLevel:
          raw.minStockLevel !== undefined && raw.minStockLevel !== '' && !isBlankPlaceholder(raw.minStockLevel)
            ? Math.max(0, parseFlexibleNumeric(raw.minStockLevel))
            : 5,
        unit: cleanOptionalText(raw.unit, 32) || 'pcs',
        batchNumber: cleanOptionalText(raw.batchNumber, 64),
        expiryDate: raw.expiryDate ? normalizeIsoDate(raw.expiryDate).slice(0, 32) : '',
        status: String(raw.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      };
    }
    case 'customers': {
      const rawType = String(raw.type || 'Individual').trim();
      const lowerType = rawType.toLowerCase();
      let matchedType =
        ['Individual', 'Business', 'Wholesale', 'VIP'].find(
          (t) => t.toLowerCase() === lowerType
        ) || 'Individual';
      if (lowerType === 'retail' || lowerType === 'walk-in' || lowerType === 'walkin') {
        matchedType = 'Individual';
      } else if (lowerType === 'corporate' || lowerType === 'company') {
        matchedType = 'Business';
      }
      return {
        name: String(raw.name || '').trim().slice(0, 150),
        phone: normalizeUgPhone(raw.phone).slice(0, 30),
        email: raw.email ? String(raw.email).trim().toLowerCase().slice(0, 254) : '',
        address: raw.address ? String(raw.address).trim().slice(0, 250) : '',
        type: matchedType,
        creditLimit: Math.max(0, parseFlexibleNumeric(raw.creditLimit)),
        currentBalance: Math.max(0, parseFlexibleNumeric(raw.currentBalance)),
        loyaltyPoints: Math.max(0, Math.round(parseFlexibleNumeric(raw.loyaltyPoints))),
      };
    }
    case 'suppliers':
      return {
        name: String(raw.name || '').trim().slice(0, 150),
        contactPerson: cleanOptionalText(raw.contactPerson, 120),
        phone: normalizeUgPhone(raw.phone).slice(0, 30),
        email: raw.email ? String(raw.email).trim().toLowerCase().slice(0, 254) : '',
        address: raw.address ? String(raw.address).trim().slice(0, 250) : '',
        category: cleanOptionalText(raw.category, 80) || 'Wholesale',
        currentBalance: Math.max(0, parseFlexibleNumeric(raw.currentBalance)),
        status: String(raw.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      };
    case 'sales': {
      const qty = Math.max(1, parseFlexibleNumeric(raw.quantity) || 1);
      const unitPrice = Math.max(0, parseFlexibleNumeric(raw.unitPrice));
      const discount = Math.max(0, parseFlexibleNumeric(raw.discount));
      const total = Math.max(0, parseFlexibleNumeric(raw.total) || qty * unitPrice - discount);
      const rawStatus = String(raw.status || 'completed').trim().toLowerCase();
      const status =
        rawStatus === 'pending' || rawStatus === 'overdue' || rawStatus === 'unpaid' || rawStatus === 'partial'
          ? 'pending'
          : rawStatus === 'refunded' || rawStatus === 'void' || rawStatus === 'voided'
          ? 'refunded'
          : 'completed';
      return {
        reference: cleanOptionalText(raw.reference, 64),
        customerName: cleanOptionalText(raw.customerName, 150),
        customerPhone: normalizeUgPhone(raw.customerPhone).slice(0, 30),
        itemName: cleanOptionalText(raw.itemName, 150) || 'Imported Sale Item',
        sku: cleanOptionalText(raw.sku, 64),
        quantity: qty,
        unitPrice: unitPrice || (qty > 0 ? Math.round(total / qty) : total),
        discount,
        total,
        paymentMethod: normalizePaymentMethod(raw.paymentMethod),
        status,
        saleDate: raw.saleDate ? normalizeIsoDate(raw.saleDate).slice(0, 32) : '',
        ...(Array.isArray(raw.items) && raw.items.length > 0 ? { items: raw.items } : {}),
      };
    }
    case 'refunds': {
      const qty = Math.max(1, parseFlexibleNumeric(raw.quantity) || 1);
      const total = Math.max(0, parseFlexibleNumeric(raw.total));
      return {
        reference: cleanOptionalText(raw.reference, 64),
        customerName: cleanOptionalText(raw.customerName, 150),
        itemName: cleanOptionalText(raw.itemName, 150) || 'Refunded Item',
        quantity: qty,
        total,
        paymentMethod: normalizePaymentMethod(raw.paymentMethod),
        refundReason: cleanOptionalText(raw.refundReason, 300) || 'Customer return',
        refundDate: raw.refundDate ? normalizeIsoDate(raw.refundDate).slice(0, 32) : '',
        ...(Array.isArray(raw.items) && raw.items.length > 0 ? { items: raw.items } : {}),
      };
    }
    case 'purchases': {
      const qty = Math.max(1, parseFlexibleNumeric(raw.quantity) || 1);
      const unitCost = Math.max(0, parseFlexibleNumeric(raw.unitCost));
      const totalAmount = Math.max(0, parseFlexibleNumeric(raw.totalAmount) || qty * unitCost);
      const rawPaidStr = String(raw.paidAmount ?? '').trim().toLowerCase();
      let paidAmount = 0;
      if (rawPaidStr === 'paid' || rawPaidStr === 'full') {
        paidAmount = totalAmount;
      } else if (rawPaidStr === 'part paid' || rawPaidStr === 'partial' || rawPaidStr === 'part-paid') {
        paidAmount = Math.round(totalAmount * 0.5);
      } else if (rawPaidStr === 'unpaid' || rawPaidStr === 'pending') {
        paidAmount = 0;
      } else {
        paidAmount = Math.min(totalAmount, Math.max(0, parseFlexibleNumeric(raw.paidAmount)));
      }
      const rawStatus = String(raw.status || 'ordered').trim().toLowerCase();
      const status =
        rawStatus === 'received' || rawStatus === 'delivered' || rawStatus === 'complete' || rawStatus === 'completed'
          ? 'received'
          : rawStatus === 'cancelled' || rawStatus === 'canceled'
          ? 'cancelled'
          : 'ordered';
      return {
        reference: cleanOptionalText(raw.reference, 64),
        supplierName: cleanOptionalText(raw.supplierName, 150),
        supplierPhone: normalizeUgPhone(raw.supplierPhone).slice(0, 30),
        itemName: cleanOptionalText(raw.itemName, 150) || 'Restock Item',
        sku: cleanOptionalText(raw.sku, 64),
        quantity: qty,
        unitCost: unitCost || (qty > 0 ? Math.round(totalAmount / qty) : totalAmount),
        totalAmount,
        paidAmount,
        status,
        expectedDate: raw.expectedDate ? normalizeIsoDate(raw.expectedDate).slice(0, 32) : '',
        notes: cleanOptionalText(raw.notes, 300),
        ...(Array.isArray(raw.items) && raw.items.length > 0 ? { items: raw.items } : {}),
      };
    }
    case 'expenses': {
      const desc = cleanOptionalText(raw.description, 300);
      return {
        expenseDate: raw.expenseDate
          ? normalizeIsoDate(raw.expenseDate).slice(0, 32)
          : new Date().toISOString().split('T')[0],
        category: inferExpenseCategory(desc, raw.category),
        description: desc,
        amount: Math.max(0, parseFlexibleNumeric(raw.amount)),
        paymentMethod: normalizePaymentMethod(raw.paymentMethod),
      };
    }
  }
}

export function applyMappingsLocally(
  entityType: SmartImportEntityType,
  rawSpreadsheetRows: Array<Record<string, any>>,
  mappings: SmartImportFieldMapping[]
): Array<Record<string, any>> {
  const normKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return rawSpreadsheetRows
    .map((raw) => {
      const normalizedRawMap = new Map<string, any>();
      for (const [k, v] of Object.entries(raw)) {
        normalizedRawMap.set(normKey(k), v);
      }
      const mapped: Record<string, any> = {};
      for (const m of mappings) {
        if (m.targetField && m.targetField !== 'ignore') {
          const val = raw[m.sourceHeader] !== undefined ? raw[m.sourceHeader] : normalizedRawMap.get(normKey(m.sourceHeader));
          if (val !== undefined && val !== '') {
            mapped[m.targetField] = val;
          }
        }
      }
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        mapped.items = raw.items;
      }
      return sanitizeRowForEntity(entityType, mapped);
    })
    .filter((row) => Object.values(row).some((v) => v !== '' && v !== 0 && v !== undefined));
}

export function detectEntityTypeLocally(headers: string[]): SmartImportEntityType {
  const joined = headers.map((h) => normalizeClientHeader(h)).join(' | ');
  if (/refund|refunded via|credit note/.test(joined)) return 'refunds';
  if (/expense|monthly|run rate|rent|umeme|utility|utilities|particulars/.test(joined)) return 'expenses';
  if (/po no|purchase order|unit cost|line total/.test(joined) && /supplier|vendor/.test(joined)) {
    return 'purchases';
  }
  if (/supplier|vendor/.test(joined)) {
    return /qty|quantity|item|unit cost|total amount/.test(joined) ? 'purchases' : 'suppliers';
  }
  if (/owing|total sales|customer since|credit limit|loyalty/.test(joined)) return 'customers';
  if (/invoice|inv no|receipt|cashier|discount|payment method/.test(joined) && !/buying|stock|min stock|reorder/.test(joined)) {
    return 'sales';
  }
  if (/selling|buying|wholesale|vip|sku|barcode|stock|qty|expiry|batch|reorder/.test(joined)) {
    return 'products';
  }
  if (/customer|client/.test(joined)) return 'customers';
  if (/phone|tel|mobile|email/.test(joined)) return 'customers';
  return 'products';
}

export function tryParseStructuredTextLocally(
  entityType: SmartImportEntityType | 'auto',
  text: string,
  fileName = ''
): SmartImportExtractResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // JSON array support
  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        const headers = Array.from(
          new Set(parsed.flatMap((item) => (item && typeof item === 'object' ? Object.keys(item) : [])))
        );
        const resolvedEntity = entityType === 'auto' ? detectEntityTypeLocally(headers) : entityType;
        const mappings = inferFieldMappingsLocally(resolvedEntity, headers);
        const rows = applyMappingsLocally(resolvedEntity, parsed, mappings);
        return {
          entityType: resolvedEntity,
          detectedEntityType: resolvedEntity,
          detectionConfidence: entityType === 'auto' ? 'medium' : 'high',
          detectedFormat: 'JSON Dataset (Instant Local Map)',
          summary: `Mapped ${mappings.filter((m) => m.targetField !== 'ignore').length} fields across ${rows.length} JSON records.`,
          sourceHeaders: headers,
          fieldMappings: mappings,
          rawSpreadsheetRows: parsed,
          rows,
          warnings: [],
        };
      }
    } catch {
      return null;
    }
  }

  // Delimited CSV / TSV check
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  if (headers.length < 2) return null;

  const resolvedEntity = entityType === 'auto' ? detectEntityTypeLocally(headers) : entityType;

  const rawSpreadsheetRows: Array<Record<string, any>> = [];
  for (let i = 1; i < lines.length && rawSpreadsheetRows.length < 500; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const rowObj: Record<string, any> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const val = cols[idx] ?? '';
      if (val) hasValue = true;
      rowObj[h] = val;
    });
    if (hasValue) rawSpreadsheetRows.push(rowObj);
  }

  if (rawSpreadsheetRows.length === 0) return null;

  const fieldMappings = inferFieldMappingsLocally(resolvedEntity, headers);
  const rows = applyMappingsLocally(resolvedEntity, rawSpreadsheetRows, fieldMappings);

  return {
    entityType: resolvedEntity,
    detectedEntityType: resolvedEntity,
    detectionConfidence: entityType === 'auto' ? 'medium' : 'high',
    detectedFormat: delimiter === '\t' ? 'TSV Table (Instant Local Map)' : 'CSV Spreadsheet (Instant Local Map)',
    summary: `Auto-detected ${fieldMappings.filter((m) => m.targetField !== 'ignore').length} of ${headers.length} columns across ${rows.length} rows (${resolvedEntity}).`,
    sourceHeaders: headers,
    fieldMappings,
    rawSpreadsheetRows,
    rows,
    warnings: [],
  };
}

export function validateSmartImportRow(
  entityType: SmartImportEntityType,
  row: Record<string, any>
): string | null {
  switch (entityType) {
    case 'products':
      if (!String(row.name || '').trim()) return 'Missing product name';
      if (Number(row.sellingPrice) < 0 || !Number.isFinite(Number(row.sellingPrice))) return 'Invalid selling price';
      return null;
    case 'customers':
      if (!String(row.name || '').trim()) return 'Missing customer name';
      if (String(row.phone || '').trim().length < 10) return 'Phone must be at least 10 digits';
      return null;
    case 'suppliers':
      if (!String(row.name || '').trim()) return 'Missing supplier name';
      if (String(row.phone || '').trim().length < 10) return 'Phone must be at least 10 digits';
      return null;
    case 'sales':
      if (Number(row.total) < 0 || !Number.isFinite(Number(row.total))) return 'Invalid sale total';
      if (!String(row.paymentMethod || '').trim()) return 'Missing payment method';
      return null;
    case 'refunds':
      if (Number(row.total) <= 0) return 'Refund total must be > 0';
      if (!String(row.refundReason || '').trim()) return 'Missing refund reason';
      return null;
    case 'purchases':
      if (!String(row.supplierName || '').trim()) return 'Missing supplier name';
      if (!String(row.itemName || '').trim()) return 'Missing item name';
      if (Number(row.quantity) <= 0) return 'Quantity must be > 0';
      return null;
    case 'expenses':
      if (!String(row.description || '').trim()) return 'Missing description';
      if (Number(row.amount) <= 0) return 'Amount must be > 0';
      return null;
  }
}
