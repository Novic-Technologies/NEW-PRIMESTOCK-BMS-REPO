import { Customer, Sale, Tenant } from '../types';
import { formatUGX } from './format';

export function formatUgPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('256')) return digits;
  if (digits.startsWith('0')) return `256${digits.slice(1)}`;
  if (digits.length === 9) return `256${digits}`;
  return digits;
}

export function buildSaleWhatsAppUrl(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null
): string {
  const lines = [
    `*${tenant.name}*`,
    tenant.branding?.tagline ? `_${tenant.branding.tagline}_` : '',
    tenant.branding?.receiptHeader ? tenant.branding.receiptHeader : '',
    tenant.tin ? `TIN: ${tenant.tin}` : '',
    tenant.branding?.supportPhone ? `Tel: ${tenant.branding.supportPhone}` : '',
    `Receipt: *${sale.reference}*`,
    `Date: ${new Date(sale.createdAt).toLocaleString('en-UG')}`,
    '---',
    ...sale.items.map(
      (item) => `• ${item.name} x${item.quantity} — ${formatUGX(item.total)}`
    ),
    '---',
    sale.discount > 0 ? `Discount: -${formatUGX(sale.discount)}` : '',
    sale.taxAmount && sale.taxAmount > 0
      ? `VAT (${sale.taxRate ?? 18}%): ${formatUGX(sale.taxAmount)}`
      : '',
    `*TOTAL PAID: ${formatUGX(sale.total)}*`,
    `Method: ${sale.paymentMethod}`,
    sale.paymentReference ? `Payment Ref: ${sale.paymentReference}` : '',
    typeof sale.changeGiven === 'number' && sale.changeGiven > 0
      ? `Tendered: ${formatUGX(sale.cashTendered || sale.total)} | Change: ${formatUGX(sale.changeGiven)}`
      : '',
    tenant.preferences?.receiptFooter?.trim() || 'Thank you for shopping with us!',
    '_Built & managed by Novic Technologies_',
  ].filter(Boolean);

  const phone = formatUgPhoneForWhatsApp(customer?.phone);
  const encoded = encodeURIComponent(lines.join('\n'));
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildDebtWhatsAppUrl(phone: string | undefined, message: string): string {
  const cleanPhone = formatUgPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
