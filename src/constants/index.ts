// Tax & Compliance
export const VAT_RATE = 0.18; // 18% VAT
export const NSSF_EMPLOYEE = 0.05; // 5%
export const NSSF_EMPLOYER = 0.10; // 10%

// PAYE Brackets (UGX per month, 2024/25 URA rates)
export const PAYE_BRACKETS = [
  { min: 0,         max: 235000,   rate: 0.00 },
  { min: 235001,    max: 335000,   rate: 0.10 },
  { min: 335001,    max: 410000,   rate: 0.20 },
  { min: 410001,    max: Infinity, rate: 0.30 },
];

// Currency
export const DEFAULT_CURRENCY = 'UGX';
export const CURRENCY_SYMBOL = 'UGX';
export const SECONDARY_CURRENCY = 'USD';

// Payment Methods
export const PAYMENT_METHODS = [
  'Cash', 'MTN Mobile Money', 'Airtel Money',
  'Bank Transfer', 'Flutterwave', 'Customer Credit', 'Cheque'
];

// Business Types (for onboarding)
export const BUSINESS_TYPES = [
  'Retail Shop', 'Wholesale/Distribution', 'Pharmacy', 'Supermarket',
  'Hardware Store', 'Restaurant/Food', 'Salon/Barbershop', 'School',
  'Clinic/Hospital', 'Agriculture/Produce', 'Electronics', 'Clothing/Fashion',
  'Real Estate/Rental', 'Auto Parts', 'Stationery', 'Other'
];

// Ugandan Banks
export const BANKS = [
  'Stanbic Bank Uganda', 'Centenary Bank', 'DFCU Bank', 'Equity Bank Uganda',
  'Absa Bank Uganda', 'Bank of Africa', 'Housing Finance Bank', 'PostBank Uganda',
  'Pride Microfinance', 'UGAFODE', 'Other'
];
