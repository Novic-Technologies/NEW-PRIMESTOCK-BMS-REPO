export type UgandaCarrier = 'MTN' | 'AIRTEL' | 'OTHER' | 'INVALID';

export interface ParsedUgPhone {
  valid: boolean;
  e164: string;
  localDisplay: string;
  carrier: UgandaCarrier;
}

const MTN_PREFIXES = ['77', '78', '76', '39'];
const AIRTEL_PREFIXES = ['70', '75', '74', '20'];

export function parseUgandaPhone(input: string): ParsedUgPhone {
  const digits = input.replace(/[^\d]/g, '');
  let subscriber = '';

  if (digits.startsWith('256') && digits.length === 12) {
    subscriber = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    subscriber = digits.slice(1);
  } else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('3') || digits.startsWith('2'))) {
    subscriber = digits;
  }

  if (subscriber.length !== 9) {
    return {
      valid: false,
      e164: '',
      localDisplay: input.trim(),
      carrier: 'INVALID',
    };
  }

  const prefix = subscriber.slice(0, 2);
  let carrier: UgandaCarrier = 'OTHER';
  if (MTN_PREFIXES.includes(prefix)) carrier = 'MTN';
  else if (AIRTEL_PREFIXES.includes(prefix)) carrier = 'AIRTEL';

  return {
    valid: true,
    e164: `+256${subscriber}`,
    localDisplay: `0${subscriber.slice(0, 3)} ${subscriber.slice(3, 6)} ${subscriber.slice(6)}`,
    carrier,
  };
}

export const UGX_CASH_NOTES = [5000, 10000, 20000, 50000, 100000, 200000];

export function buildMtnMerchantUssd(merchantCode?: string, amountUgx?: number): string {
  const code = merchantCode?.trim();
  if (code && amountUgx && amountUgx > 0) {
    return `*165*3*${code}*${Math.round(amountUgx)}#`;
  }
  if (code) {
    return `*165*3*${code}#`;
  }
  return '*165*3#';
}

export function buildAirtelMerchantUssd(merchantCode?: string, amountUgx?: number): string {
  const code = merchantCode?.trim();
  if (code && amountUgx && amountUgx > 0) {
    return `*185*9*${code}*${Math.round(amountUgx)}#`;
  }
  if (code) {
    return `*185*9*${code}#`;
  }
  return '*185*9#';
}
