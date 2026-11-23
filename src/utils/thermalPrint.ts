import { Customer, Sale, Tenant } from '../types';
import { formatUGX } from './format';

export function buildEscPosReceiptText(sale: Sale, tenant: Tenant, customer?: Customer | null): string {
  const line = '--------------------------------';
  const dateStr = new Date(sale.createdAt).toLocaleString('en-UG');
  const rows = sale.items.map((item) => {
    const qtyPrice = `${item.quantity} x ${item.price.toLocaleString()}`;
    return `${item.name.slice(0, 32)}\n  ${qtyPrice.padEnd(18)} ${item.total.toLocaleString().padStart(10)}`;
  });

  const footer = tenant.preferences?.receiptFooter?.trim() || 'Thank you for your business!';
  const parts = [
    '\x1B\x40', // ESC @ Initialize
    '\x1B\x61\x01', // Center align
    `${tenant.name.toUpperCase()}\n`,
    tenant.branding?.tagline ? `${tenant.branding.tagline}\n` : '',
    tenant.branding?.receiptHeader ? `${tenant.branding.receiptHeader}\n` : '',
    tenant.tin ? `URA TIN: ${tenant.tin}\n` : '',
    tenant.branding?.supportPhone ? `Tel: ${tenant.branding.supportPhone}\n` : '',
    sale.branchName ? `Branch: ${sale.branchName}\n` : '',
    `${line}\n`,
    '\x1B\x61\x00', // Left align
    `Receipt: ${sale.reference}\n`,
    `Date:    ${dateStr}\n`,
    sale.cashierName ? `Cashier: ${sale.cashierName}\n` : '',
    customer ? `Client:  ${customer.name}\n` : '',
    `Method:  ${sale.paymentMethod}\n`,
    sale.paymentReference ? `Pay Ref: ${sale.paymentReference}\n` : '',
    sale.payerPhone ? `Phone:   ${sale.payerPhone}\n` : '',
    `${line}\n`,
    ...rows.map((r) => `${r}\n`),
    `${line}\n`,
    `Subtotal: ${formatUGX(sale.subtotal)}\n`,
    sale.discount > 0 ? `Discount: -${formatUGX(sale.discount)}\n` : '',
    sale.taxAmount && sale.taxAmount > 0 ? `VAT (${sale.taxRate ?? 18}%): ${formatUGX(sale.taxAmount)}\n` : '',
    `TOTAL:    ${formatUGX(sale.total)}\n`,
    typeof sale.cashTendered === 'number' && sale.cashTendered > 0
      ? `Tendered: ${formatUGX(sale.cashTendered)}\n`
      : '',
    typeof sale.changeGiven === 'number' && sale.changeGiven > 0
      ? `Change:   ${formatUGX(sale.changeGiven)}\n`
      : '',
    `${line}\n`,
    '\x1B\x61\x01',
    `${footer}\n`,
    `Built & managed by Novic Technologies\n\n\n`,
    '\x1D\x56\x41\x03', // Partial cut
  ];

  return parts.filter(Boolean).join('');
}

export async function printViaThermalSerial(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null
): Promise<{ printed: boolean; mode: 'serial' | 'browser' }> {
  const nav = navigator as Navigator & {
    serial?: {
      requestPort: () => Promise<{
        open: (opts: { baudRate: number }) => Promise<void>;
        writable: WritableStream<Uint8Array> | null;
        close: () => Promise<void>;
      }>;
    };
  };

  if (nav.serial) {
    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 9600 });
      const writer = port.writable?.getWriter();
      if (writer) {
        const encoder = new TextEncoder();
        const payload = buildEscPosReceiptText(sale, tenant, customer);
        await writer.write(encoder.encode(payload));
        writer.releaseLock();
      }
      await port.close();
      return { printed: true, mode: 'serial' };
    } catch (err) {
      // If user cancels serial port picker or printer isn't connected, fall back cleanly to browser print
      console.warn('Web Serial thermal print fallback to browser print:', err);
    }
  }

  window.print();
  return { printed: true, mode: 'browser' };
}
