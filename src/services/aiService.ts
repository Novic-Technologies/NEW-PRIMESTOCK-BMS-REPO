import { auth } from '../firebase';
import {
  DeadStockMarginResult,
  DebtReminderResult,
  EodDigestResult,
  RestockRecommendation,
  ScannedDocumentResult,
} from '../types';

export interface CopilotBusinessContext {
  businessName: string;
  branchName?: string;
  plan?: string;
  status?: string;
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
}): Promise<{ verified: boolean; mode: string; reference: string }> {
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
