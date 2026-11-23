import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { PlatformBillingConfig, PlatformPaymentChannelConfig } from '../types';

export const DEFAULT_PLATFORM_CHANNELS: PlatformPaymentChannelConfig[] = [
  {
    id: 'mtn_momo',
    label: 'MTN MoMo',
    paymentMethodName: 'MTN Mobile Money',
    sublabel: '*165*3# / Merchant Pay',
    enabled: true,
    accountName: 'Novic Technologies Ltd',
    accountNumber: '',
    ussdPrefix: '*165*3#',
    instructions: 'Dial *165*3# (MoMoPay) or send Mobile Money to our merchant number, then enter your Transaction ID.',
  },
  {
    id: 'airtel_money',
    label: 'Airtel Money',
    paymentMethodName: 'Airtel Money',
    sublabel: '*185*9# / Merchant Pay',
    enabled: true,
    accountName: 'Novic Technologies Ltd',
    accountNumber: '',
    ussdPrefix: '*185*9#',
    instructions: 'Dial *185*9# (Airtel Money Pay) or send via Airtel Money, then enter your Transaction ID.',
  },
  {
    id: 'flutterwave',
    label: 'Flutterwave',
    paymentMethodName: 'Flutterwave Card/MoMo',
    sublabel: 'Card / Instant MoMo',
    enabled: true,
    accountName: 'Novic Technologies Ltd',
    accountNumber: '',
    instructions: 'Pay securely via Flutterwave MoMo Push or Card and submit the transaction reference.',
  },
  {
    id: 'bank_transfer',
    label: 'Bank Transfer',
    paymentMethodName: 'Bank Transfer',
    sublabel: 'EFT / RTGS / Deposit',
    enabled: true,
    accountName: 'Novic Technologies Ltd',
    bankName: 'Stanbic Bank Uganda',
    accountNumber: '',
    instructions: 'Make an EFT/RTGS or branch deposit and upload the bank reference for Master Admin verification.',
  },
];

export const DEFAULT_PLATFORM_BILLING_CONFIG: PlatformBillingConfig = {
  id: 'billing',
  channels: DEFAULT_PLATFORM_CHANNELS,
  supportPhone: '',
  supportEmail: 'davidmagero22@gmail.com',
  supportWhatsapp: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export function normalizePlatformBillingConfig(
  raw?: Partial<PlatformBillingConfig> | null
): PlatformBillingConfig {
  if (!raw || !Array.isArray(raw.channels) || raw.channels.length === 0) {
    return {
      ...DEFAULT_PLATFORM_BILLING_CONFIG,
      channels: DEFAULT_PLATFORM_CHANNELS.map((c) => ({ ...c })),
    };
  }

  const normalizedChannels: PlatformPaymentChannelConfig[] = raw.channels
    .filter((ch): ch is PlatformPaymentChannelConfig => Boolean(ch && ch.id && ch.label))
    .slice(0, 15)
    .map((ch) => ({
      id: String(ch.id).trim().slice(0, 40),
      label: String(ch.label).trim().slice(0, 60),
      paymentMethodName: String(ch.paymentMethodName || ch.label).trim().slice(0, 80),
      sublabel: String(ch.sublabel || '').trim().slice(0, 60),
      enabled: Boolean(ch.enabled),
      accountName: ch.accountName ? String(ch.accountName).trim().slice(0, 120) : '',
      accountNumber: ch.accountNumber ? String(ch.accountNumber).trim().slice(0, 80) : '',
      bankName: ch.bankName ? String(ch.bankName).trim().slice(0, 80) : '',
      ussdPrefix: ch.ussdPrefix ? String(ch.ussdPrefix).trim().slice(0, 40) : '',
      instructions: ch.instructions ? String(ch.instructions).trim().slice(0, 300) : '',
    }));

  return {
    id: 'billing',
    channels:
      normalizedChannels.length > 0
        ? normalizedChannels
        : DEFAULT_PLATFORM_CHANNELS.map((c) => ({ ...c })),
    supportPhone: raw.supportPhone ? String(raw.supportPhone).trim().slice(0, 40) : '',
    supportEmail: raw.supportEmail
      ? String(raw.supportEmail).trim().slice(0, 254)
      : DEFAULT_PLATFORM_BILLING_CONFIG.supportEmail,
    supportWhatsapp: raw.supportWhatsapp ? String(raw.supportWhatsapp).trim().slice(0, 40) : '',
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy || undefined,
  };
}

export function usePlatformBillingConfig() {
  const [config, setConfig] = useState<PlatformBillingConfig>(() =>
    normalizePlatformBillingConfig(DEFAULT_PLATFORM_BILLING_CONFIG)
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'platformConfig', 'billing');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setConfig(normalizePlatformBillingConfig(snap.data() as PlatformBillingConfig));
        } else {
          setConfig(normalizePlatformBillingConfig(DEFAULT_PLATFORM_BILLING_CONFIG));
        }
        setIsLoading(false);
      },
      () => {
        setConfig(normalizePlatformBillingConfig(DEFAULT_PLATFORM_BILLING_CONFIG));
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { config, isLoading };
}
