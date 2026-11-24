import { Customer, Sale, Tenant } from '../types';
import { formatUGX } from './format';

const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

function shouldKickDrawer(sale: Sale, tenant: Tenant): boolean {
  if (!tenant.preferences?.cashDrawerKickEnabled) return false;
  if (sale.status === 'refunded') return false;
  if (sale.paymentMethod === 'Cash') return true;
  return Boolean(sale.splitPayments?.some((p) => p.method === 'Cash' && p.amount > 0));
}

export function buildEscPosReceiptText(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null,
  options?: { kickDrawer?: boolean }
): string {
  const line = '--------------------------------';
  const dateStr = new Date(sale.createdAt).toLocaleString('en-UG');
  const rows = sale.items.map((item) => {
    const qtyPrice = `${item.quantity} x ${item.price.toLocaleString()}`;
    return `${item.name.slice(0, 32)}\n  ${qtyPrice.padEnd(18)} ${item.total.toLocaleString().padStart(10)}`;
  });

  const footer = tenant.preferences?.receiptFooter?.trim() || 'Thank you for your business!';
  const kickPulse =
    options?.kickDrawer ?? shouldKickDrawer(sale, tenant)
      ? '\x1B\x70\x00\x19\xFA' // ESC p m t1 t2 (Cash Drawer Kick Pin 2)
      : '';

  const parts = [
    '\x1B\x40', // ESC @ Initialize
    kickPulse,
    '\x1B\x61\x01', // Center align
    `${tenant.name.toUpperCase()}\n`,
    tenant.branding?.tagline ? `${tenant.branding.tagline}\n` : '',
    tenant.branding?.receiptHeader ? `${tenant.branding.receiptHeader}\n` : '',
    tenant.tin ? `URA TIN: ${tenant.tin}\n` : '',
    tenant.branding?.supportPhone ? `Tel: ${tenant.branding.supportPhone}\n` : '',
    sale.branchName ? `Branch: ${sale.branchName}\n` : '',
    sale.status === 'refunded' ? `*** CREDIT NOTE / REFUND ***\n` : '',
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
    sale.loyaltyDiscountUgx && sale.loyaltyDiscountUgx > 0
      ? `Loyalty:  -${formatUGX(sale.loyaltyDiscountUgx)}\n`
      : '',
    sale.taxAmount && sale.taxAmount > 0
      ? `VAT (${sale.taxRate ?? 18}%): ${formatUGX(sale.taxAmount)}\n`
      : '',
    `TOTAL:    ${formatUGX(sale.total)}\n`,
    typeof sale.cashTendered === 'number' && sale.cashTendered > 0
      ? `Tendered: ${formatUGX(sale.cashTendered)}\n`
      : '',
    typeof sale.changeGiven === 'number' && sale.changeGiven > 0
      ? `Change:   ${formatUGX(sale.changeGiven)}\n`
      : '',
    sale.loyaltyPointsEarned && sale.loyaltyPointsEarned > 0
      ? `Points Earned: +${sale.loyaltyPointsEarned} pts\n`
      : '',
    sale.efrisFdn ? `${line}\n` : '',
    sale.efrisFdn ? `URA EFRIS ${sale.efrisStatus === 'sandbox' ? '(SANDBOX)' : 'FISCAL'}\n` : '',
    sale.efrisFdn ? `FDN:    ${sale.efrisFdn}\n` : '',
    sale.efrisVerificationCode ? `Verify: ${sale.efrisVerificationCode}\n` : '',
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
      console.warn('Web Serial thermal print fallback to browser print:', err);
    }
  }

  window.print();
  return { printed: true, mode: 'browser' };
}

export async function printViaThermalBluetooth(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null
): Promise<{ printed: boolean; mode: 'bluetooth' | 'browser' }> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: {
        acceptAllDevices?: boolean;
        optionalServices?: string[];
      }) => Promise<{
        gatt?: {
          connect: () => Promise<{
            getPrimaryServices: () => Promise<
              Array<{
                getCharacteristics: () => Promise<
                  Array<{
                    properties: { write?: boolean; writeWithoutResponse?: boolean };
                    writeValue?: (data: BufferSource) => Promise<void>;
                    writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
                  }>
                >;
              }>
            >;
          }>;
          disconnect?: () => void;
        };
      }>;
    };
  };

  if (nav.bluetooth) {
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICES,
      });
      const server = await device.gatt?.connect();
      if (server) {
        const services = await server.getPrimaryServices();
        let targetChar: {
          properties: { write?: boolean; writeWithoutResponse?: boolean };
          writeValue?: (data: BufferSource) => Promise<void>;
          writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
        } | null = null;

        for (const svc of services) {
          const chars = await svc.getCharacteristics();
          const writable = chars.find(
            (c) => c.properties.writeWithoutResponse || c.properties.write
          );
          if (writable) {
            targetChar = writable;
            break;
          }
        }

        if (targetChar) {
          const payload = buildEscPosReceiptText(sale, tenant, customer);
          const bytes = new TextEncoder().encode(payload);
          const CHUNK_SIZE = 180;
          for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
            const slice = bytes.slice(offset, offset + CHUNK_SIZE);
            if (targetChar.properties.writeWithoutResponse && targetChar.writeValueWithoutResponse) {
              await targetChar.writeValueWithoutResponse(slice);
            } else if (targetChar.writeValue) {
              await targetChar.writeValue(slice);
            }
          }
          device.gatt?.disconnect?.();
          return { printed: true, mode: 'bluetooth' };
        }
      }
    } catch (err) {
      console.warn('Web Bluetooth thermal print fallback to browser print:', err);
    }
  }

  window.print();
  return { printed: true, mode: 'browser' };
}

export function openRawBtPrintIntent(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null
): { printed: boolean; mode: 'rawbt' } {
  const escPosText = buildEscPosReceiptText(sale, tenant, customer);
  const bytes = new TextEncoder().encode(escPosText);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const link = document.createElement('a');
  link.href = `rawbt:base64,${base64}`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return { printed: true, mode: 'rawbt' };
}

export async function printReceiptDispatch(
  sale: Sale,
  tenant: Tenant,
  customer?: Customer | null
): Promise<{ printed: boolean; mode: 'serial' | 'bluetooth' | 'rawbt' | 'browser' }> {
  const mode = tenant.preferences?.thermalPrintMode || 'browser';
  if (mode === 'bluetooth') {
    return printViaThermalBluetooth(sale, tenant, customer);
  }
  if (mode === 'rawbt') {
    return openRawBtPrintIntent(sale, tenant, customer);
  }
  if (mode === 'serial') {
    return printViaThermalSerial(sale, tenant, customer);
  }
  window.print();
  return { printed: true, mode: 'browser' };
}
