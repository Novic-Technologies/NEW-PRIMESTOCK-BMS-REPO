import { Tenant, TenantBranding } from '../types';

export interface BrandThemePreset {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  secondaryAccentColor: string;
}

export const SYSTEM_LOGO_URL = '/assets/aistudio/Minimalist_Navy_Monogram_Emblem_804982e2.png';

export const DEFAULT_BRANDING: Required<
  Pick<TenantBranding, 'primaryColor' | 'accentColor' | 'secondaryAccentColor' | 'presetId'>
> = {
  primaryColor: '#0B1F3A',
  accentColor: '#0F766E',
  secondaryAccentColor: '#B45309',
  presetId: 'kampala_navy',
};

export const BRAND_PRESETS: BrandThemePreset[] = [
  {
    id: 'kampala_navy',
    name: 'Kampala Executive',
    description: 'Deep executive navy with restrained slate-teal actions',
    primaryColor: '#0B1F3A',
    accentColor: '#0F766E',
    secondaryAccentColor: '#B45309',
  },
  {
    id: 'emerald_fresh',
    name: 'Emerald Mart',
    description: 'Rich forest green for supermarkets & agro-vet',
    primaryColor: '#064E3B',
    accentColor: '#10B981',
    secondaryAccentColor: '#F59E0B',
  },
  {
    id: 'royal_burgundy',
    name: 'Royal Commerce',
    description: 'Bold wine crimson for boutiques, salons & hospitality',
    primaryColor: '#4C0519',
    accentColor: '#E11D48',
    secondaryAccentColor: '#F59E0B',
  },
  {
    id: 'savannah_espresso',
    name: 'Savannah Gold',
    description: 'Warm espresso dark slate with amber gold accents',
    primaryColor: '#292524',
    accentColor: '#D97706',
    secondaryAccentColor: '#059669',
  },
  {
    id: 'cobalt_pharma',
    name: 'Cobalt Clinic',
    description: 'Trusted medical blue for pharmacies & hardware',
    primaryColor: '#1E3A8A',
    accentColor: '#0284C7',
    secondaryAccentColor: '#10B981',
  },
  {
    id: 'obsidian_tech',
    name: 'Obsidian Pro',
    description: 'Clean charcoal slate for electronics & wholesale',
    primaryColor: '#0F172A',
    accentColor: '#2563EB',
    secondaryAccentColor: '#F59E0B',
  },
];

export function isValidHexColor(value?: string): value is string {
  return Boolean(value && /^#[0-9A-Fa-f]{6}$/.test(value.trim()));
}

export function getContrastTextColor(hex: string): '#FFFFFF' | '#0F172A' {
  if (!isValidHexColor(hex)) return '#FFFFFF';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance heuristic
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 155 ? '#0F172A' : '#FFFFFF';
}

export function applyTenantTheme(tenant: Tenant | null) {
  const root = document.documentElement;
  const primary = isValidHexColor(tenant?.branding?.primaryColor)
    ? tenant!.branding!.primaryColor!
    : DEFAULT_BRANDING.primaryColor;
  const accent = isValidHexColor(tenant?.branding?.accentColor)
    ? tenant!.branding!.accentColor!
    : DEFAULT_BRANDING.accentColor;
  const secondary = isValidHexColor(tenant?.branding?.secondaryAccentColor)
    ? tenant!.branding!.secondaryAccentColor!
    : DEFAULT_BRANDING.secondaryAccentColor;

  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-brand-primary', primary);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-brand-accent', accent);
  root.style.setProperty('--color-accent-alt', secondary);
  root.style.setProperty('--color-primary-contrast', getContrastTextColor(primary));
  root.style.setProperty('--color-accent-contrast', getContrastTextColor(accent));

  document.title = tenant?.name
    ? `${tenant.name} — Business Management System`
    : 'PRIMESTOCK BMS UG';

  const faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (faviconEl) {
    faviconEl.href = tenant?.logo || SYSTEM_LOGO_URL;
  }
}

export function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file (PNG, JPG, WebP, or SVG).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const maxDim = 180;
        const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
        const targetW = Math.max(32, Math.round((img.width || maxDim) * scale));
        const targetH = Math.max(32, Math.round((img.height || maxDim) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing is unavailable in this browser.'));
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let dataUrl = canvas.toDataURL('image/webp', 0.85);
        if (!dataUrl.startsWith('data:image/webp') || dataUrl.length > 48000) {
          dataUrl = canvas.toDataURL('image/png');
        }
        if (dataUrl.length > 55000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        }
        if (dataUrl.length > 58000) {
          reject(new Error('Logo image is too large. Please choose a simpler or smaller logo file.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
