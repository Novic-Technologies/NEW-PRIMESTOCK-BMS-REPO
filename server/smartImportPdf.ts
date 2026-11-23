export type SmartEntityType =
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'sales'
  | 'refunds'
  | 'purchases'
  | 'expenses';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface PdfExtractedTable {
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  headers: string[];
  rawRows: Array<Record<string, string>>;
  headerScore: number;
  isComputedSummary: boolean;
}

export const ENTITY_TARGET_FIELDS: Record<SmartEntityType, string[]> = {
  products: [
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
    'status',
  ],
  customers: ['name', 'phone', 'email', 'address', 'type', 'creditLimit', 'currentBalance', 'loyaltyPoints'],
  suppliers: ['name', 'contactPerson', 'phone', 'email', 'address', 'category', 'currentBalance', 'status'],
  sales: [
    'reference',
    'customerName',
    'customerPhone',
    'itemName',
    'sku',
    'quantity',
    'unitPrice',
    'discount',
    'total',
    'paymentMethod',
    'status',
    'saleDate',
  ],
  refunds: [
    'reference',
    'customerName',
    'itemName',
    'quantity',
    'total',
    'paymentMethod',
    'refundReason',
    'refundDate',
  ],
  purchases: [
    'reference',
    'supplierName',
    'supplierPhone',
    'itemName',
    'sku',
    'quantity',
    'unitCost',
    'totalAmount',
    'paidAmount',
    'status',
    'expectedDate',
    'notes',
  ],
  expenses: ['expenseDate', 'category', 'description', 'amount', 'paymentMethod'],
};

export const SERVER_REQUIRED_FIELDS: Record<SmartEntityType, string[]> = {
  products: ['name', 'sellingPrice'],
  customers: ['name', 'phone'],
  suppliers: ['name', 'phone'],
  sales: ['itemName', 'total'],
  refunds: ['itemName', 'total'],
  purchases: ['itemName', 'supplierName'],
  expenses: ['description', 'amount'],
};

export const SERVER_ENTITY_ALIASES: Record<SmartEntityType, Record<string, string[]>> = {
  products: {
    name: ['name', 'product', 'product name', 'productname', 'item', 'item name', 'itemname', 'description', 'title', 'goods'],
    category: ['category', 'cat', 'group', 'department', 'class'],
    sku: ['sku', 'code', 'item code', 'product code', 'ref'],
    barcode: ['barcode', 'ean', 'upc', 'gtin'],
    buyingPrice: ['buyingprice', 'buying price', 'cost', 'cost price', 'unit cost', 'bp', 'purchase price'],
    sellingPrice: ['sellingprice', 'selling price', 'retail price', 'retail', 'sp', 'unit price', 'selling', 'price', 'rate'],
    wholesalePrice: ['wholesaleprice', 'wholesale price', 'wholesale', 'whl'],
    vipPrice: ['vipprice', 'vip price', 'vip'],
    currentStock: ['currentstock', 'current stock', 'stock', 'qty', 'quantity', 'on hand', 'balance', 'units', 'count'],
    minStockLevel: ['minstocklevel', 'min stock', 'reorder', 'reorder level', 'reorder lvl', 'min level', 'min'],
    unit: ['unit', 'uom', 'measure', 'pack'],
    batchNumber: ['batchnumber', 'batch', 'lot', 'batch no', 'batch number'],
    expiryDate: ['expirydate', 'expiry', 'exp', 'best before', 'exp date', 'expiry date'],
    status: ['status', 'state'],
  },
  customers: {
    name: ['name', 'customer', 'customer name', 'client', 'full name', 'company'],
    phone: ['phone', 'tel', 'telephone', 'mobile', 'contact', 'whatsapp', 'phone number'],
    email: ['email', 'e mail', 'mail'],
    address: ['address', 'location', 'area', 'town', 'city'],
    type: ['type', 'tier', 'category', 'segment'],
    creditLimit: ['creditlimit', 'credit limit', 'limit'],
    currentBalance: ['currentbalance', 'owing', 'amount owed', 'balance', 'debt', 'owed', 'opening balance', 'credit balance'],
    loyaltyPoints: ['loyaltypoints', 'points', 'loyalty'],
  },
  suppliers: {
    name: ['name', 'supplier', 'vendor', 'company', 'business name', 'supplier name'],
    contactPerson: ['contactperson', 'contact person', 'rep', 'manager'],
    phone: ['phone', 'tel', 'mobile', 'telephone', 'phone number'],
    email: ['email', 'mail'],
    address: ['address', 'location', 'area'],
    category: ['category', 'type', 'sector'],
    currentBalance: ['currentbalance', 'balance owed', 'amount owed', 'balance', 'payable', 'owed'],
    status: ['status', 'state'],
  },
  sales: {
    reference: ['reference', 'ref', 'invoice', 'invoice no', 'inv no', 'receipt', 'receipt no', 'sale id'],
    saleDate: ['saledate', 'sale date', 'date', 'createdat', 'timestamp'],
    customerName: ['customername', 'customer', 'customer name', 'buyer', 'client'],
    customerPhone: ['customerphone', 'customer phone', 'phone', 'tel'],
    itemName: ['itemname', 'product', 'item', 'item name', 'description', 'items'],
    sku: ['sku', 'code'],
    quantity: ['quantity', 'qty', 'units'],
    unitPrice: ['unitprice', 'unit price', 'price', 'rate'],
    discount: ['discount', 'disc'],
    total: ['total', 'line total', 'amount', 'grand total', 'net total', 'subtotal'],
    paymentMethod: ['paymentmethod', 'payment method', 'method', 'payment', 'mode'],
    status: ['status', 'state'],
  },
  refunds: {
    reference: ['invoice', 'invoice no', 'reference', 'ref', 'receipt', 'sale ref'],
    refundDate: ['refunddate', 'refund date', 'date', 'returned at'],
    customerName: ['customername', 'customer', 'client'],
    itemName: ['itemname', 'product', 'item', 'description'],
    quantity: ['quantity', 'qty', 'units'],
    total: ['total', 'refund amount', 'amount', 'value'],
    paymentMethod: ['refunded via', 'refund method', 'paymentmethod', 'payment method', 'method', 'payment'],
    refundReason: ['refundreason', 'reason', 'notes', 'comment'],
  },
  purchases: {
    reference: ['po no', 'po number', 'reference', 'ref', 'po', 'invoice', 'invoice no'],
    supplierName: ['suppliername', 'supplier', 'supplier name', 'vendor', 'wholesaler'],
    supplierPhone: ['supplierphone', 'supplier phone', 'phone', 'tel'],
    itemName: ['itemname', 'product', 'item', 'description'],
    sku: ['sku', 'code'],
    quantity: ['quantity', 'qty', 'units'],
    unitCost: ['unitcost', 'unit cost', 'cost', 'buyingprice', 'rate'],
    totalAmount: ['totalamount', 'total amount', 'line total', 'total', 'amount'],
    paidAmount: ['paidamount', 'paid amount', 'paid', 'payment', 'payment status'],
    status: ['status', 'delivery', 'delivery status', 'state'],
    expectedDate: ['expecteddate', 'expected date', 'date', 'delivery date'],
    notes: ['notes', 'remarks', 'memo'],
  },
  expenses: {
    expenseDate: ['expensedate', 'expense date', 'date', 'createdat'],
    category: ['category', 'type', 'group'],
    description: ['description', 'expense', 'expense item', 'details', 'item', 'particulars', 'vendor', 'note'],
    amount: ['amount', 'monthly', 'monthly ugx', 'run rate', 'cost', 'total', 'spent'],
    paymentMethod: ['paymentmethod', 'payment method', 'method', 'payment', 'mode'],
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

const SERVER_MONTH_MAP: Record<string, number> = {
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

export function isBlankPlaceholder(raw: unknown): boolean {
  const str = String(raw ?? '').trim();
  return !str || /^(n\/?a|none|nil|null|tbd|unk|unknown|-+|—)$/i.test(str);
}

export function cleanOptionalText(raw: unknown, maxLen: number): string {
  const str = String(raw ?? '').trim();
  if (isBlankPlaceholder(str)) return '';
  return str.slice(0, maxLen);
}

export function normalizeIsoDate(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (isBlankPlaceholder(str)) return '';
  const isoDirect = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (isoDirect) {
    return `${isoDirect[1]}-${isoDirect[2].padStart(2, '0')}-${isoDirect[3].padStart(2, '0')}`;
  }
  const dMonY = str.match(/^(\d{1,2})[\s\-\/,]+([A-Za-z]+)[\s\-\/,]+(\d{2,4})$/);
  if (dMonY) {
    const mIdx = SERVER_MONTH_MAP[dMonY[2].toLowerCase()];
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
    const mIdx = SERVER_MONTH_MAP[monDY[1].toLowerCase()];
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

export function sanitizeExtractedRow(entityType: SmartEntityType, raw: Record<string, any>): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
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
      let type =
        ['Individual', 'Business', 'Wholesale', 'VIP'].find((t) => t.toLowerCase() === lowerType) ||
        'Individual';
      if (lowerType === 'retail' || lowerType === 'walk-in' || lowerType === 'walkin') {
        type = 'Individual';
      } else if (lowerType === 'corporate' || lowerType === 'company') {
        type = 'Business';
      }
      return {
        name: String(raw.name || '').trim().slice(0, 150),
        phone: normalizeUgPhone(raw.phone).slice(0, 30),
        email: raw.email ? String(raw.email).trim().toLowerCase().slice(0, 254) : '',
        address: raw.address ? String(raw.address).trim().slice(0, 250) : '',
        type,
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
      const computedTotal = Math.max(0, parseFlexibleNumeric(raw.total) || qty * unitPrice - discount);
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
        unitPrice: unitPrice || (qty > 0 ? Math.round(computedTotal / qty) : computedTotal),
        discount,
        total: computedTotal,
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
        refundReason: cleanOptionalText(raw.refundReason, 300) || 'Imported customer refund',
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

export function normalizeLookupKey(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeServerHeader(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\(ugx\)|\(usd\)|\(w\)|\(r\)|ugx|shs|ush|\/=/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const UNCONDITIONAL_IGNORE_RE =
  /^(no\.?|s\/?n|sn|#|index|serial|row|mfg\.?\s*date|manufacture\s*date|manufactured|stock\s*value.*|customer\s*since|last\s*order|units\s*in\s*stock|payment\s*terms|margin.*|potential\s*margin|share|age)$/i;

function shouldIgnoreHeaderForEntity(entityType: SmartEntityType, trimmed: string, normalized: string): boolean {
  if (!normalized || UNCONDITIONAL_IGNORE_RE.test(trimmed) || UNCONDITIONAL_IGNORE_RE.test(normalized)) {
    return true;
  }
  if (entityType === 'products') {
    if (normalized === 'supplier' || normalized === 'vendor') return true;
  }
  if (entityType === 'customers') {
    if (/^(id|orders|total sales|refunds|contact person)$/.test(normalized)) return true;
  }
  if (entityType === 'suppliers') {
    if (/^(id|products|orders|purchases)$/.test(normalized)) return true;
  }
  if (entityType === 'sales') {
    if (/^(tier)$/.test(normalized)) return true;
  }
  if (entityType === 'refunds') {
    if (/^(refund|refund id|refund no)$/.test(normalized)) return true;
  }
  if (entityType === 'purchases') {
    if (/^(lines|batch|batch no)$/.test(normalized)) return true;
  }
  return false;
}

export function inferServerFieldMappings(
  entityType: SmartEntityType,
  headers: string[]
): Array<{ sourceHeader: string; targetField: string; confidence: 'high' | 'medium' | 'low' }> {
  const aliasMap = SERVER_ENTITY_ALIASES[entityType];
  const usedTargets = new Set<string>();
  const resolved: Array<{ sourceHeader: string; targetField: string; confidence: 'high' | 'medium' | 'low' }> =
    headers.map((header) => ({
      sourceHeader: header,
      targetField: 'ignore',
      confidence: 'low' as const,
    }));

  const normalizedPerIdx = headers.map((h) => {
    const trimmed = String(h || '').trim();
    const normalized = normalizeServerHeader(trimmed);
    const ignored = shouldIgnoreHeaderForEntity(entityType, trimmed, normalized);
    return { trimmed, normalized, ignored };
  });

  // Pass 1: exact alias matches across ALL headers first so weak partial hits never steal required columns
  for (let i = 0; i < headers.length; i++) {
    const { normalized, ignored } = normalizedPerIdx[i];
    if (ignored) continue;
    for (const [targetField, aliases] of Object.entries(aliasMap)) {
      if (usedTargets.has(targetField)) continue;
      const normKey = normalizeServerHeader(targetField);
      if (normKey === normalized || aliases.some((a) => normalizeServerHeader(a) === normalized)) {
        usedTargets.add(targetField);
        resolved[i] = { sourceHeader: headers[i], targetField, confidence: 'high' };
        break;
      }
    }
  }

  // Pass 2: partial alias matches for remaining unmapped >= 3-char headers
  for (let i = 0; i < headers.length; i++) {
    if (resolved[i].targetField !== 'ignore') continue;
    const { normalized, ignored } = normalizedPerIdx[i];
    if (ignored || normalized.length < 3) continue;
    for (const [targetField, aliases] of Object.entries(aliasMap)) {
      if (usedTargets.has(targetField)) continue;
      const partialHit = aliases.some((a) => {
        const na = normalizeServerHeader(a);
        return na.length >= 3 && (normalized.includes(na) || na.includes(normalized));
      });
      if (partialHit) {
        usedTargets.add(targetField);
        resolved[i] = { sourceHeader: headers[i], targetField, confidence: 'medium' };
        break;
      }
    }
  }

  return resolved;
}

export function detectServerEntityType(headers: string[], titleHint = ''): SmartEntityType {
  const entityScores: Record<SmartEntityType, number> = {
    products: 0,
    customers: 0,
    suppliers: 0,
    sales: 0,
    refunds: 0,
    purchases: 0,
    expenses: 0,
  };

  const normalizedHeaders = headers.map((h) => normalizeServerHeader(h)).filter(Boolean);
  const lowHint = titleHint.toLowerCase();

  for (const entity of Object.keys(entityScores) as SmartEntityType[]) {
    const mappings = inferServerFieldMappings(entity, headers);
    const matched = mappings.filter((m) => m.targetField !== 'ignore');
    let score = matched.reduce((acc, m) => acc + (m.confidence === 'high' ? 3 : 1.5), 0);
    const mappedSet = new Set(matched.map((m) => m.targetField));

    if (entity === 'products') {
      if (mappedSet.has('sellingPrice')) score += 4;
      if (mappedSet.has('currentStock')) score += 4;
      if (mappedSet.has('sku') || mappedSet.has('barcode')) score += 3;
      if (mappedSet.has('expiryDate') || mappedSet.has('batchNumber')) score += 3;
      if (mappedSet.has('wholesalePrice') || mappedSet.has('vipPrice')) score += 3;
      if (normalizedHeaders.some((h) => /^po no|^invoice/.test(h))) score -= 8;
    } else if (entity === 'sales') {
      if (mappedSet.has('saleDate') && mappedSet.has('total')) score += 4;
      if (mappedSet.has('paymentMethod') && mappedSet.has('customerName')) score += 3;
      if (normalizedHeaders.some((h) => /^invoice|^inv no/.test(h))) score += 6;
      if (normalizedHeaders.some((h) => h === 'refunded via' || h === 'reason')) score -= 10;
    } else if (entity === 'refunds') {
      if (mappedSet.has('refundReason') || mappedSet.has('refundDate')) score += 6;
      if (normalizedHeaders.some((h) => h === 'refund' || h === 'refunded via')) score += 8;
    } else if (entity === 'purchases') {
      if (mappedSet.has('supplierName') && (mappedSet.has('unitCost') || mappedSet.has('totalAmount'))) score += 6;
      if (mappedSet.has('paidAmount') || mappedSet.has('expectedDate')) score += 3;
      if (normalizedHeaders.some((h) => /^po\b|^po no/.test(h))) score += 8;
    } else if (entity === 'customers') {
      if (mappedSet.has('creditLimit') || mappedSet.has('loyaltyPoints')) score += 6;
      if (normalizedHeaders.some((h) => h.includes('customer'))) score += 5;
      if (normalizedHeaders.some((h) => /^(orders|total sales|owing|customer since)$/.test(h))) score += 6;
    } else if (entity === 'suppliers') {
      if (mappedSet.has('contactPerson')) score += 5;
      if (normalizedHeaders.some((h) => h.includes('supplier') || h.includes('vendor'))) score += 5;
      if (normalizedHeaders.some((h) => /^(balance owed|payment terms|units in stock)$/.test(h))) score += 6;
      if (normalizedHeaders.some((h) => /^po\b|^po no/.test(h))) score -= 6;
    } else if (entity === 'expenses') {
      if (mappedSet.has('expenseDate') || normalizedHeaders.some((h) => h.includes('expense'))) score += 6;
      if (normalizedHeaders.some((h) => /^monthly/.test(h))) score += 4;
    }

    if (lowHint) {
      if (entity === 'suppliers' && /supplier\s*directory|suppliers\s*report/.test(lowHint)) score += 6;
      if (entity === 'customers' && /customer\s*directory|customers/.test(lowHint)) score += 6;
      if (entity === 'purchases' && /purchase/.test(lowHint)) score += 6;
      if (entity === 'refunds' && /refund|return/.test(lowHint)) score += 8;
      if (entity === 'sales' && /invoice|sales/.test(lowHint) && !/refund/.test(lowHint)) score += 6;
      if (entity === 'expenses' && /operating\s*expense|expense/.test(lowHint)) score += 8;
      if (entity === 'products' && /product\s*register|product\s*inventory|inventory\s*report/.test(lowHint)) score += 6;
    }

    entityScores[entity] = score;
  }

  let best: SmartEntityType = 'products';
  let bestScore = -1;
  for (const entity of Object.keys(entityScores) as SmartEntityType[]) {
    if (entityScores[entity] > bestScore) {
      bestScore = entityScores[entity];
      best = entity;
    }
  }
  return best;
}

const DATA_ID_OR_DATE_OR_MONEY_RE =
  /^(?:(?:INV|PO|REF|C)-\d+|[A-Z]{2,4}-\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|0\d{9}|\+?256\d{9}|\d{1,3}(?:,\d{3})+)$/i;

export function scoreHeaderLineParts(parts: string[]): number {
  if (parts.length < 2) return 0;
  // Data rows containing document IDs, SKUs, dates, phone numbers, or comma-formatted UGX amounts are never headers
  if (parts.some((p) => DATA_ID_OR_DATE_OR_MONEY_RE.test(p.trim()))) {
    return 0;
  }

  const allKnownTokens = new Set<string>([
    'no', 'id', 'sn', 's n', 'sku', 'product', 'product name', 'item', 'item name',
    'category', 'unit', 'units', 'qty', 'quantity', 'stock', 'reorder', 'reorder lvl', 'reorder level',
    'wholesale', 'retail', 'vip', 'price', 'selling price', 'buying price', 'cost', 'unit cost', 'unit price',
    'batch', 'batch no', 'mfg date', 'expiry', 'expiry date', 'supplier', 'customer',
    'phone', 'tel', 'email', 'address', 'total', 'amount', 'line total', 'discount', 'date',
    'payment', 'payment method', 'payment terms', 'status', 'delivery', 'reference', 'ref', 'reason', 'description',
    'balance', 'balance owed', 'owing', 'credit limit', 'contact person', 'notes',
    'po no', 'invoice', 'refund', 'refunded via', 'refunds', 'tier', 'items', 'lines', 'orders',
    'total sales', 'customer since', 'last order', 'expense', 'monthly', 'received',
    'metric', 'value', 'line', 'method', 'age', 'share', 'products', 'units sold', 'sales value',
    'at wholesale', 'at retail', 'potential margin', 'purchases', 'low stock', 'total units',
    'stock value', 'stock value wholesale', 'stock value retail', 'units in stock',
  ]);

  let nonNumericCells = 0;
  let keywordHits = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^\d[\d,.\s/%-]*$/.test(trimmed)) continue;
    nonNumericCells++;
    const norm = normalizeServerHeader(trimmed);
    if (!norm) continue;
    if (allKnownTokens.has(norm) || UNCONDITIONAL_IGNORE_RE.test(trimmed)) {
      keywordHits++;
    } else if (/^(stock value|at wholesale|at retail|nov \d+|oct \d+|unpaid.*part)/.test(norm)) {
      keywordHits++;
    }
  }
  const nonEmptyCount = parts.filter((p) => p.trim() !== '').length;
  if (nonEmptyCount < 2 || nonNumericCells < Math.ceil(nonEmptyCount * 0.85)) return 0;
  return keywordHits;
}

export function isLikelySummaryFooterRow(parts: string[]): boolean {
  const firstNonEmpty = parts.find((p) => p.trim() !== '')?.trim() || '';
  if (!firstNonEmpty) return true;
  if (/^(total|grand\s*total|sub\s*-?\s*total|totals|total\s+received|overall\s*total|summary)$/i.test(firstNonEmpty)) {
    return true;
  }
  const second = (parts[1] || '').trim();
  if (/^(total|grand\s*total|sub\s*-?\s*total|totals)$/i.test(second)) {
    return true;
  }
  return false;
}

interface PdfRowBand {
  y: number;
  tol: number;
  fontSize: number;
  items: PdfTextItem[];
}

function getItemEndX(it: PdfTextItem): number {
  const piece = it.str.trim();
  return it.x + (it.width > 0 ? it.width : piece.length * ((it.fontSize || 10) * 0.5));
}

function buildMergedPageBands(rawItems: PdfTextItem[]): PdfRowBand[] {
  // Filter page footer bands and blank text
  const filtered = (rawItems || []).filter((it) => {
    const s = (it.str || '').trim();
    if (!s) return false;
    if (it.y < 36 && (/^Page\s+\d+/i.test(s) || /Sample data for testing|Stock position date/i.test(s))) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) return [];

  const rows: PdfRowBand[] = [];
  const sorted = [...filtered].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const tol = Math.max(2.5, (item.fontSize || 10) * 0.36);
    const existingRow = rows.find((r) => Math.abs(r.y - item.y) <= Math.max(r.tol, tol));
    if (existingRow) {
      existingRow.items.push(item);
    } else {
      rows.push({ y: item.y, tol, fontSize: item.fontSize || 10, items: [item] });
    }
  }

  // Re-attach sparse vertically wrapped cell/header fragments (1-3 items) to nearest dense anchor row (>= 4 items)
  // Searching past neighboring sparse fragments guarantees both top and bottom wrapped lines attach to the middle anchor row.
  const mergedRows = rows.map((r) => ({ ...r, items: [...r.items] }));
  const removedIndices = new Set<number>();

  for (let i = 0; i < mergedRows.length; i++) {
    const cur = mergedRows[i];
    if (cur.items.length > 3) continue;
    const maxDist = Math.max(8.5, cur.fontSize * 1.1);

    let prevIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (Math.abs(mergedRows[j].y - cur.y) > 16) break;
      if (mergedRows[j].items.length >= 4) {
        prevIdx = j;
        break;
      }
    }

    let nextIdx = -1;
    for (let j = i + 1; j < mergedRows.length; j++) {
      if (Math.abs(cur.y - mergedRows[j].y) > 16) break;
      if (mergedRows[j].items.length >= 4) {
        nextIdx = j;
        break;
      }
    }

    const dPrev = prevIdx >= 0 ? Math.abs(mergedRows[prevIdx].y - cur.y) : Infinity;
    const dNext = nextIdx >= 0 ? Math.abs(cur.y - mergedRows[nextIdx].y) : Infinity;
    const bestDist = Math.min(dPrev, dNext);
    const otherDist = Math.max(dPrev, dNext);

    if (bestDist <= maxDist && (bestDist < otherDist * 0.78 || otherDist > maxDist + 2)) {
      const targetIdx = dPrev <= dNext ? prevIdx : nextIdx;
      mergedRows[targetIdx].items.push(...cur.items);
      removedIndices.add(i);
    }
  }

  return mergedRows.filter((_, i) => !removedIndices.has(i));
}

function splitBandIntoColumnBoxes(
  items: PdfTextItem[],
  gapFactor = 0.50,
  minGapFloor = 4.0
): Array<{ label: string; startX: number; endX: number }> {
  const sortedByX = [...items].sort((a, b) => a.x - b.x || b.y - a.y);
  const cells: Array<{
    x: number;
    endX: number;
    fontSize: number;
    parts: PdfTextItem[];
  }> = [];

  for (const it of sortedByX) {
    const endX = getItemEndX(it);
    const overlapCell = cells.find(
      (c) => Math.abs(c.parts[0].y - it.y) > 2 && it.x <= c.endX - 1 && endX >= c.x + 1
    );
    if (overlapCell) {
      overlapCell.parts.push(it);
      overlapCell.x = Math.min(overlapCell.x, it.x);
      overlapCell.endX = Math.max(overlapCell.endX, endX);
    } else {
      cells.push({ x: it.x, endX, fontSize: it.fontSize || 10, parts: [it] });
    }
  }

  cells.sort((a, b) => a.x - b.x);
  const grouped: Array<{ label: string; startX: number; endX: number; fontSize: number }> = [];

  for (const cell of cells) {
    cell.parts.sort((a, b) => b.y - a.y || a.x - b.x);
    const text = cell.parts
      .map((pt) => pt.str.trim())
      .filter(Boolean)
      .join(' ');
    if (!text) continue;

    if (grouped.length === 0) {
      grouped.push({ label: text, startX: cell.x, endX: cell.endX, fontSize: cell.fontSize });
    } else {
      const prev = grouped[grouped.length - 1];
      const gap = cell.x - prev.endX;
      const threshold = Math.max(minGapFloor, Math.min(prev.fontSize, cell.fontSize) * gapFactor);
      if (gap > threshold) {
        grouped.push({ label: text, startX: cell.x, endX: cell.endX, fontSize: cell.fontSize });
      } else {
        prev.label = `${prev.label} ${text}`;
        prev.endX = Math.max(prev.endX, cell.endX);
      }
    }
  }

  return grouped.map(({ label, startX, endX }) => ({ label, startX, endX }));
}

function snapRowItemsToColumns(
  items: PdfTextItem[],
  colBoxes: Array<{ label: string; startX: number; endX: number }>
): { cells: string[]; multiColSpanDetected: boolean } {
  const buckets: PdfTextItem[][] = Array.from({ length: colBoxes.length }, () => []);
  let multiColSpanDetected = false;

  for (const it of items) {
    const itStart = it.x;
    const itEnd = getItemEndX(it);
    let bestCol = -1;
    let bestOverlap = -1;
    let colsWithSubstantialOverlap = 0;

    for (let c = 0; c < colBoxes.length; c++) {
      const col = colBoxes[c];
      const overlap = Math.min(itEnd, col.endX + 1.5) - Math.max(itStart, col.startX - 1.5);
      if (overlap > 8) colsWithSubstantialOverlap++;
      if (overlap > 0 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCol = c;
      }
    }

    if (colsWithSubstantialOverlap >= 2) {
      multiColSpanDetected = true;
    }

    if (bestCol === -1) {
      // Fallback: minimum horizontal interval distance to header box
      let minDist = Infinity;
      for (let c = 0; c < colBoxes.length; c++) {
        const col = colBoxes[c];
        const dist = itEnd < col.startX ? col.startX - itEnd : itStart > col.endX ? itStart - col.endX : 0;
        if (dist < minDist) {
          minDist = dist;
          bestCol = c;
        }
      }
    }

    if (bestCol >= 0) {
      buckets[bestCol].push(it);
    }
  }

  const cells = buckets.map((bucket) => {
    if (bucket.length === 0) return '';
    bucket.sort((a, b) => b.y - a.y || a.x - b.x);
    return bucket
      .map((pt) => pt.str.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  });

  return { cells, multiColSpanDetected };
}

function isComputedSummaryTable(sectionTitle: string, headers: string[]): boolean {
  const titleLow = sectionTitle.toLowerCase();
  if (
    /^(summary|inventory summary|summary by category|profit\s*&\s*loss|balance sheet|receivables ageing|stock valuation|cash received|sales by payment|purchases by supplier|top 10|supplier payables)/i.test(
      titleLow
    )
  ) {
    return true;
  }
  const normHeaders = headers.map((h) => normalizeServerHeader(h));
  const sig = normHeaders.join('|');
  if (
    sig === 'metric|value' ||
    sig === 'item|amount' ||
    sig === 'age|amount' ||
    sig === 'method|received' ||
    sig.includes('potential margin') ||
    sig.includes('at wholesale|at retail') ||
    (normHeaders[0] === 'line' && normHeaders.some((h) => /^(oct|nov|jan|feb|mar|total)$/.test(h))) ||
    (normHeaders[0] === 'category' && normHeaders.includes('products') && normHeaders.includes('low stock')) ||
    (normHeaders[0] === 'method' && normHeaders.includes('share')) ||
    (normHeaders[0] === 'supplier' && normHeaders.includes('orders') && !normHeaders.includes('phone'))
  ) {
    return true;
  }
  return false;
}

export function extractPdfTablesWithCoordinates(pageItems: PdfTextItem[][]): {
  tables: PdfExtractedTable[];
  docTitle: string;
} {
  const groups = new Map<
    string,
    {
      sectionTitle: string;
      pageStart: number;
      pageEnd: number;
      headers: string[];
      headerScore: number;
      rows: string[][];
      isComputedSummary: boolean;
    }
  >();

  let docTitle = '';
  let activeKey: string | null = null;
  let activeColBoxes: Array<{ label: string; startX: number; endX: number }> = [];

  for (let p = 0; p < pageItems.length; p++) {
    const bands = buildMergedPageBands(pageItems[p] || []);
    let lastHeading = '';

    for (let bi = 0; bi < bands.length; bi++) {
      const band = bands[bi];
      const textBoxes = splitBandIntoColumnBoxes(band.items, 0.50, 4.0);
      const rawLine = textBoxes.map((b) => b.label).join(' ');

      if (p === 0 && bi <= 2 && rawLine && !docTitle) {
        docTitle = rawLine;
      } else if (p === 0 && bi === 1 && docTitle && rawLine) {
        docTitle = `${docTitle} — ${rawLine}`;
      }

      if (
        /^(All names, customers|Pricing tiers:|Gross margin:|Operating expenses are illustrative|Below reorder level:|Currency: Ugandan)/i.test(
          rawLine
        )
      ) {
        activeKey = null;
        continue;
      }

      const parts = textBoxes.map((b) => b.label.trim());
      const hScore = scoreHeaderLineParts(parts);
      const minRequiredHits = Math.max(2, Math.ceil(parts.length * 0.55));

      if (parts.length >= 2 && hScore >= minRequiredHits) {
        const sigParts = parts.map((pt) => normalizeServerHeader(pt) || pt.toLowerCase());
        const baseSig = sigParts.join('|');
        // Distinguish tables that share identical headers across entities if unrelated, EXCEPT multi-page tables stitch together
        const existingGroup = groups.get(baseSig);
        if (existingGroup) {
          activeKey = baseSig;
          activeColBoxes = textBoxes.map((b, idx) => ({
            label: existingGroup.headers[idx] || b.label,
            startX: b.startX,
            endX: b.endX,
          }));
          existingGroup.pageEnd = p + 1;
        } else {
          const dedupedHeaders: string[] = [];
          const seenHdrs = new Set<string>();
          parts.forEach((pt, idx) => {
            let label = pt || `Column_${idx + 1}`;
            if (seenHdrs.has(label.toLowerCase())) label = `${label}_${idx + 1}`;
            seenHdrs.add(label.toLowerCase());
            dedupedHeaders.push(label);
          });

          const sectionTitle = lastHeading || '';
          groups.set(baseSig, {
            sectionTitle,
            pageStart: p + 1,
            pageEnd: p + 1,
            headers: dedupedHeaders,
            headerScore: hScore,
            rows: [],
            isComputedSummary: isComputedSummaryTable(sectionTitle, dedupedHeaders),
          });
          activeKey = baseSig;
          activeColBoxes = textBoxes.map((b, idx) => ({
            label: dedupedHeaders[idx],
            startX: b.startX,
            endX: b.endX,
          }));
        }
        continue;
      }

      // 1-box section headings break any active table and set sectionTitle for the next header
      if (textBoxes.length === 1 && band.items.length <= 2) {
        const txt = textBoxes[0].label.trim();
        if (txt.length >= 3 && !/^\d[\d,.\s/%-]*$/.test(txt)) {
          lastHeading = txt;
          activeKey = null;
        }
        continue;
      }

      if (!activeKey || activeColBoxes.length === 0) continue;
      const activeGroup = groups.get(activeKey);
      if (!activeGroup) continue;

      const { cells, multiColSpanDetected } = snapRowItemsToColumns(band.items, activeColBoxes);
      if (multiColSpanDetected) {
        activeKey = null;
        continue;
      }

      const nonEmptyCells = cells.filter((c) => c !== '').length;
      if (nonEmptyCells < Math.min(2, activeGroup.headers.length)) {
        continue;
      }

      if (isLikelySummaryFooterRow(cells)) {
        activeKey = null;
        continue;
      }

      activeGroup.rows.push(cells);
      activeGroup.pageEnd = p + 1;
    }
  }

  const tables: PdfExtractedTable[] = [];
  for (const g of groups.values()) {
    if (g.rows.length === 0) continue;
    const rawRows: Array<Record<string, string>> = [];
    for (const rowCells of g.rows) {
      const obj: Record<string, string> = {};
      let hasData = false;
      g.headers.forEach((h, idx) => {
        const val = (rowCells[idx] ?? '').trim();
        if (val) hasData = true;
        obj[h] = val;
      });
      if (hasData) rawRows.push(obj);
    }
    if (rawRows.length > 0) {
      tables.push({
        sectionTitle: g.sectionTitle,
        pageStart: g.pageStart,
        pageEnd: g.pageEnd,
        headers: g.headers,
        rawRows,
        headerScore: g.headerScore,
        isComputedSummary: g.isComputedSummary,
      });
    }
  }

  // Cross-table enrichment:
  // 1) Enrich Purchase Order Line Items with Delivery & Payment from Purchase Orders table (matched by PO No.)
  enrichPoLineItemsFromSummary(tables);
  // 2) Enrich Invoice Line Items with Payment & Status from Sales Invoices table (matched by Invoice ref)
  enrichSalesLineItemsFromInvoices(tables);

  return { tables, docTitle };
}

function enrichPoLineItemsFromSummary(tables: PdfExtractedTable[]) {
  const poSummary = tables.find((t) => {
    const norm = t.headers.map((h) => normalizeServerHeader(h));
    return norm.includes('po no') && (norm.includes('delivery') || norm.includes('payment')) && !norm.includes('product');
  });
  const poLineItems = tables.find((t) => {
    const norm = t.headers.map((h) => normalizeServerHeader(h));
    return norm.includes('po no') && norm.includes('product') && (norm.includes('unit cost') || norm.includes('line total'));
  });
  if (!poSummary || !poLineItems) return;

  const findHdr = (t: PdfExtractedTable, target: string) =>
    t.headers.find((h) => normalizeServerHeader(h) === target);

  const sumPoHdr = findHdr(poSummary, 'po no');
  const sumDelHdr = findHdr(poSummary, 'delivery');
  const sumPayHdr = findHdr(poSummary, 'payment');
  const linePoHdr = findHdr(poLineItems, 'po no');
  const lineTotalHdr = findHdr(poLineItems, 'line total') || findHdr(poLineItems, 'total');
  if (!sumPoHdr || !linePoHdr) return;

  const lookup = new Map<string, { delivery: string; payment: string }>();
  for (const r of poSummary.rawRows) {
    const po = (r[sumPoHdr] || '').trim().toUpperCase();
    if (!po) continue;
    lookup.set(po, {
      delivery: sumDelHdr ? (r[sumDelHdr] || '').trim() : '',
      payment: sumPayHdr ? (r[sumPayHdr] || '').trim() : '',
    });
  }

  if (sumDelHdr && !poLineItems.headers.some((h) => normalizeServerHeader(h) === 'delivery')) {
    poLineItems.headers.push('Delivery');
  }
  if (sumPayHdr && !poLineItems.headers.some((h) => normalizeServerHeader(h) === 'paid amount')) {
    poLineItems.headers.push('Paid Amount');
  }

  for (const r of poLineItems.rawRows) {
    const po = (r[linePoHdr] || '').trim().toUpperCase();
    const info = lookup.get(po);
    if (!info) continue;
    if (sumDelHdr && info.delivery && !r['Delivery']) {
      r['Delivery'] = info.delivery;
    }
    if (sumPayHdr && info.payment && !r['Paid Amount']) {
      const lineAmt = lineTotalHdr ? parseFlexibleNumeric(r[lineTotalHdr]) : 0;
      const pLow = info.payment.toLowerCase();
      if (pLow === 'paid') r['Paid Amount'] = String(lineAmt);
      else if (pLow.includes('part')) r['Paid Amount'] = String(Math.round(lineAmt * 0.5));
      else r['Paid Amount'] = '0';
    }
  }
}

function enrichSalesLineItemsFromInvoices(tables: PdfExtractedTable[]) {
  const salesInvoices = tables.find((t) => {
    const norm = t.headers.map((h) => normalizeServerHeader(h));
    return norm.includes('invoice') && (norm.includes('payment') || norm.includes('status')) && !norm.includes('product');
  });
  const invoiceLines = tables.find((t) => {
    const norm = t.headers.map((h) => normalizeServerHeader(h));
    return norm.includes('invoice') && norm.includes('product') && (norm.includes('unit price') || norm.includes('line total'));
  });
  if (!salesInvoices || !invoiceLines) return;

  const findHdr = (t: PdfExtractedTable, target: string) =>
    t.headers.find((h) => normalizeServerHeader(h) === target);

  const invHdr = findHdr(salesInvoices, 'invoice');
  const payHdr = findHdr(salesInvoices, 'payment');
  const statusHdr = findHdr(salesInvoices, 'status');
  const lineInvHdr = findHdr(invoiceLines, 'invoice');
  if (!invHdr || !lineInvHdr) return;

  const lookup = new Map<string, { payment: string; status: string }>();
  for (const r of salesInvoices.rawRows) {
    const inv = (r[invHdr] || '').trim().toUpperCase();
    if (!inv) continue;
    lookup.set(inv, {
      payment: payHdr ? (r[payHdr] || '').trim() : '',
      status: statusHdr ? (r[statusHdr] || '').trim() : '',
    });
  }

  if (payHdr && !invoiceLines.headers.some((h) => normalizeServerHeader(h) === 'payment')) {
    invoiceLines.headers.push('Payment');
  }
  if (statusHdr && !invoiceLines.headers.some((h) => normalizeServerHeader(h) === 'status')) {
    invoiceLines.headers.push('Status');
  }

  for (const r of invoiceLines.rawRows) {
    const inv = (r[lineInvHdr] || '').trim().toUpperCase();
    const info = lookup.get(inv);
    if (!info) continue;
    if (payHdr && info.payment && !r['Payment']) r['Payment'] = info.payment;
    if (statusHdr && info.status && !r['Status']) r['Status'] = info.status;
  }
}

export function selectBestPdfTable(
  tables: PdfExtractedTable[],
  requestedEntity: SmartEntityType | 'auto',
  fileName = '',
  docTitle = ''
): { table: PdfExtractedTable; entityType: SmartEntityType } | null {
  if (tables.length === 0) return null;

  const hasNonSummary = tables.some((t) => !t.isComputedSummary);
  const candidates = hasNonSummary ? tables.filter((t) => !t.isComputedSummary) : tables;
  const docHint = `${fileName} ${docTitle}`.toLowerCase();

  if (requestedEntity !== 'auto') {
    const reqFields = SERVER_REQUIRED_FIELDS[requestedEntity] || [];
    let best: PdfExtractedTable | null = null;
    let bestScore = -Infinity;

    for (const t of candidates) {
      const mappings = inferServerFieldMappings(requestedEntity, t.headers);
      const matched = mappings.filter((m) => m.targetField !== 'ignore');
      const mappedSet = new Set(matched.map((m) => m.targetField));
      const hasAllRequired = reqFields.every((f) => mappedSet.has(f));
      const matchedCount = matched.length;
      const normHeaders = t.headers.map((h) => normalizeServerHeader(h));
      const titleLow = t.sectionTitle.toLowerCase();

      let score =
        (hasAllRequired ? 120 : 0) +
        matchedCount * 12 +
        Math.min(40, t.rawRows.length * 0.2);

      if (requestedEntity === 'refunds') {
        if (/refund|return/.test(titleLow)) score += 90;
        if (mappedSet.has('refundReason')) score += 45;
        if (normHeaders.includes('refunded via') || normHeaders.includes('refund')) score += 45;
      } else if (requestedEntity === 'suppliers') {
        if (/supplier\s*directory/.test(titleLow)) score += 90;
        if (mappedSet.has('phone')) score += 40;
        if (!mappedSet.has('phone')) score -= 60;
      } else if (requestedEntity === 'purchases') {
        if (/line item/.test(titleLow) || (mappedSet.has('itemName') && mappedSet.has('unitCost'))) score += 60;
        if (/^purchase orders$/i.test(titleLow) && !mappedSet.has('itemName')) score += 20;
      } else if (requestedEntity === 'sales') {
        if (/invoice line item/.test(titleLow) || (mappedSet.has('itemName') && mappedSet.has('unitPrice'))) score += 60;
        if (mappedSet.has('reference')) score += 20;
        if (/refund|return/.test(titleLow)) score -= 80;
      } else if (requestedEntity === 'expenses') {
        if (/operating\s*expense|expense/.test(titleLow)) score += 90;
        if (normHeaders.some((h) => h.includes('expense'))) score += 45;
      } else if (requestedEntity === 'customers') {
        if (/customer\s*directory/.test(titleLow)) score += 80;
        if (mappedSet.has('phone')) score += 40;
      } else if (requestedEntity === 'products') {
        if (/register|inventory list/.test(titleLow)) score += 60;
        if (mappedSet.has('sellingPrice') && mappedSet.has('currentStock')) score += 35;
        if (normHeaders.some((h) => /^po no|^invoice|^refund$/.test(h))) score -= 70;
      }

      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }

    return best ? { table: best, entityType: requestedEntity } : null;
  }

  // Auto-detect mode across candidate tables
  let bestChoice: { table: PdfExtractedTable; entityType: SmartEntityType } | null = null;
  let bestScore = -Infinity;

  for (const t of candidates) {
    const detectedEntity = detectServerEntityType(t.headers, `${t.sectionTitle} ${docTitle}`);
    const reqFields = SERVER_REQUIRED_FIELDS[detectedEntity] || [];
    const mappings = inferServerFieldMappings(detectedEntity, t.headers);
    const matched = mappings.filter((m) => m.targetField !== 'ignore');
    const mappedSet = new Set(matched.map((m) => m.targetField));
    const hasAllRequired = reqFields.every((f) => mappedSet.has(f));

    let score =
      (hasAllRequired ? 100 : 0) +
      matched.length * 10 +
      Math.min(35, t.rawRows.length * 0.25) +
      t.headerScore * 5;

    // Document-subject alignment bonuses prevent sub-tables (like supplied products inside Suppliers.pdf) from hijacking the main document entity
    if (detectedEntity === 'suppliers' && /supplier/.test(docHint)) score += 90;
    if (detectedEntity === 'customers' && /customer/.test(docHint)) score += 90;
    if (detectedEntity === 'purchases' && /purchase/.test(docHint)) score += 90;
    if (detectedEntity === 'sales' && /sales/.test(docHint)) score += 80;
    if (detectedEntity === 'expenses' && /finance|expense/.test(docHint)) score += 90;
    if (detectedEntity === 'products' && /inventory/.test(docHint)) score += 90;

    if (detectedEntity === 'sales' && /invoice line item/.test(t.sectionTitle.toLowerCase())) score += 35;
    if (detectedEntity === 'purchases' && /line item/.test(t.sectionTitle.toLowerCase())) score += 35;

    if (score > bestScore) {
      bestScore = score;
      bestChoice = { table: t, entityType: detectedEntity };
    }
  }

  return bestChoice;
}

export function reconstructPdfStructuredText(pageItems: PdfTextItem[][]): {
  text: string;
  meaningfulChars: number;
} {
  const pageStrings: string[] = [];

  for (let p = 0; p < pageItems.length; p++) {
    const bands = buildMergedPageBands(pageItems[p] || []);
    if (bands.length === 0) continue;

    const lineTexts: string[] = [];
    for (const band of bands) {
      const boxes = splitBandIntoColumnBoxes(band.items, 0.56, 4.5);
      const line = boxes.map((b) => b.label.trim()).filter(Boolean).join(' | ');
      if (line) lineTexts.push(line);
    }

    if (lineTexts.length > 0) {
      pageStrings.push(`--- PAGE ${p + 1} ---\n${lineTexts.join('\n')}`);
    }
  }

  const fullText = pageStrings.join('\n\n').trim();
  const meaningfulChars = fullText
    .replace(/---\s*PAGE\s*\d+\s*---/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').length;
  return { text: fullText, meaningfulChars };
}
