import { auth } from '../firebase';
import {
  DeadStockMarginResult,
  DebtReminderResult,
  EnrichedProductSuggestion,
  EodDigestResult,
  GuidedSetupSuggestion,
  InvoiceCheckResult,
  MasterTriageResult,
  MomoMatchResult,
  ParsedOrderDraftResult,
  RestockRecommendation,
  ScannedDocumentResult,
  SmartImportEntityType,
  SmartImportExtractResult,
  SmartStocktakeResult,
  WhatsappReplyDraftResult,
} from '../types';

export interface CopilotBusinessContext {
  businessName: string;
  branchName?: string;
  plan?: string;
  status?: string;
  userRole?: string;
  restrictedScopeNote?: string;
  todaySalesUgx: number;
  monthSalesUgx: number;
  monthGrossProfitUgx?: number;
  monthExpensesUgx: number;
  netProfitEstimateUgx: number;
  totalProducts: number;
  lowStockProducts: Array<{ name: string; currentStock: number; minStockLevel: number; unit: string }>;
  expiringSoonProducts?: Array<{ name: string; expiryDate: string; currentStock: number }>;
  topSellingProducts: Array<{ name: string; unitsSold: number; revenueUgx: number }>;
  customerReceivablesUgx: number;
  supplierPayablesUgx: number;
  payrollLatestRunUgx?: number;
  openShiftCashUgx: number | null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function askBusinessCopilot(params: {
  prompt: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  businessContext: CopilotBusinessContext;
  language?: 'en' | 'lg' | 'sw';
  mode?: 'ask_data' | 'help' | 'general';
}): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/copilot', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to get AI response');
  }
  return data.reply || 'No insight generated.';
}

export async function fetchRestockForecast(params: {
  businessName: string;
  items: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    minStockLevel: number;
    buyingPrice: number;
    sellingPrice: number;
    unitsSoldLast30Days: number;
  }>;
}): Promise<{ summary: string; recommendations: RestockRecommendation[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/restock-forecast', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate restock forecast');
  }
  return {
    summary: data.summary || '',
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
  };
}

export async function scanDocumentImage(params: {
  imageBase64: string;
  mimeType: string;
  targetType: 'expense' | 'purchase_order';
}): Promise<ScannedDocumentResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/scan-document', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to scan document image');
  }
  return data as ScannedDocumentResult;
}

export async function fetchDeadStockMarginAnalysis(params: {
  businessName: string;
  items: Array<{
    productId: string;
    productName: string;
    currentStock: number;
    buyingPrice: number;
    sellingPrice: number;
    unitsSoldLast30Days: number;
  }>;
}): Promise<DeadStockMarginResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/dead-stock-margin', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to analyze dead stock and margins');
  }
  return data as DeadStockMarginResult;
}

export async function generateDebtReminder(params: {
  customerName: string;
  amountOwedUgx: number;
  businessName: string;
  tone: 'friendly' | 'firm' | 'final';
  language?: 'en' | 'lg' | 'sw';
}): Promise<DebtReminderResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/debt-reminder', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to draft debt reminder');
  }
  return data as DebtReminderResult;
}

export async function fetchEodOwnerDigest(params: {
  businessContext: CopilotBusinessContext;
}): Promise<EodDigestResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/eod-digest', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate end-of-day digest');
  }
  return data as EodDigestResult;
}

export async function verifyBillingPayment(params: {
  plan: string;
  amountUgx: number;
  paymentMethod: string;
  reference: string;
  transactionId?: string;
  provider?: string;
  payerPhone?: string;
}): Promise<{
  verified: boolean;
  gatewayVerified?: boolean;
  transactionId?: string;
  mode: string;
  reference: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/billing/verify-payment', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Payment verification failed');
  }
  return data;
}

export async function initiateUgandaPayment(params: {
  provider: 'mtn_momo' | 'airtel_money' | 'flutterwave';
  phone?: string;
  amountUgx: number;
  reference: string;
  customerName?: string;
  email?: string;
}): Promise<{
  initiated: boolean;
  gatewayMode: 'flutterwave_uganda_live' | 'merchant_ussd_manual';
  transactionId?: string;
  reference: string;
  ussdCode?: string;
  status?: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/payments/uganda/initiate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to initiate payment prompt');
  }
  return data;
}

export async function checkUgandaPaymentStatus(transactionId: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  reference: string;
  gatewayVerified?: boolean;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/payments/uganda/status/${encodeURIComponent(transactionId)}`, {
    method: 'GET',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to check payment status');
  }
  return data;
}

export async function checkUgandaWebhookStatus(refOrTxId: string): Promise<{
  found: boolean;
  gatewayVerified: boolean;
  transactionId?: string;
  txRef?: string;
  flwRef?: string;
  status?: string;
  amount?: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `/api/payments/uganda/webhook-status/${encodeURIComponent(refOrTxId)}`,
    {
      method: 'GET',
      headers,
    }
  );
  if (!res.ok) {
    return { found: false, gatewayVerified: false };
  }
  return (await res.json().catch(() => ({ found: false, gatewayVerified: false }))) as {
    found: boolean;
    gatewayVerified: boolean;
    transactionId?: string;
    txRef?: string;
    flwRef?: string;
    status?: string;
    amount?: number;
  };
}

export async function smartImportExtract(params: {
  entityType: SmartImportEntityType | 'auto';
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  rawText?: string;
}): Promise<SmartImportExtractResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/smart-import', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to extract records with Smart Import AI');
  }
  return data as SmartImportExtractResult;
}

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        base64: String(reader.result || ''),
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

async function compressLargeImageIfNeeded(file: File): Promise<{ base64: string; mimeType: string } | null> {
  if (!file.type.startsWith('image/') || file.size <= 3.5 * 1024 * 1024) {
    return null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 2000;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: compressed, mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

export async function readAnyFileAsBase64(
  file: File
): Promise<{ base64: string; mimeType: string; fileName: string }> {
  if (file.size > 10 * 1024 * 1024 && !file.type.startsWith('image/')) {
    throw new Error('File exceeds 10 MB upload limit. Please split large files into smaller batches.');
  }
  const compressed = await compressLargeImageIfNeeded(file);
  if (compressed) {
    return { ...compressed, fileName: file.name };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        base64: String(reader.result || ''),
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function fetchSmartStocktake(params: {
  imageBase64: string;
  mimeType: string;
  catalog: Array<{ id: string; name: string; currentStock: number; unit: string }>;
}): Promise<SmartStocktakeResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/smart-stocktake', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to count shelf image');
  }
  return data as SmartStocktakeResult;
}

export async function runAiAssistantTool<T = Record<string, any>>(
  action:
    | 'parse_order'
    | 'match_momo_sms'
    | 'whatsapp_reply'
    | 'check_invoice'
    | 'enrich_products'
    | 'guided_setup'
    | 'master_triage',
  payload: Record<string, any>
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/assistant-tools', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to run AI tool (${action})`);
  }
  return data as T;
}

export async function fetchServerAiUsage(): Promise<{
  dateKey: string;
  count: number;
  limit: number;
  tenantId: string | null;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/usage', { method: 'GET', headers });
  if (!res.ok) {
    return { dateKey: new Date().toISOString().split('T')[0], count: 0, limit: -1, tenantId: null };
  }
  return res.json();
}

export async function fiscalizeEfrisReceipt(params: {
  reference: string;
  tin?: string;
  businessName: string;
  branchName?: string;
  buyerName?: string;
  buyerTin?: string;
  items: Array<{ productName: string; quantity: number; price: number; subtotal: number }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  deviceNo?: string;
  sandbox?: boolean;
  isCreditNote?: boolean;
}): Promise<{
  efrisFdn: string;
  efrisVerificationCode: string;
  efrisQrData: string;
  efrisFiscalizedAt: string;
  efrisStatus: 'fiscalized' | 'sandbox';
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/efris/fiscalize', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fiscalize receipt with URA EFRIS');
  }
  return data;
}

export async function triggerServerExpirySweep(): Promise<{
  ok: boolean;
  checkedCount: number;
  lockedCount: number;
  remindedCount: number;
  emailedCount: number;
  details: Array<{ tenantId: string; name: string; action: string }>;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/cron/subscription-sweep', {
    method: 'POST',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Server expiry sweep failed');
  }
  return data;
}

export type {
  ParsedOrderDraftResult,
  MomoMatchResult,
  WhatsappReplyDraftResult,
  InvoiceCheckResult,
  EnrichedProductSuggestion,
  GuidedSetupSuggestion,
  MasterTriageResult,
};



