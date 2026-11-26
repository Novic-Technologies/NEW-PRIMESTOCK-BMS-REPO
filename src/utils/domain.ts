export const CANONICAL_DOMAIN = 'primestockug.com';
export const CANONICAL_ORIGIN = 'https://primestockug.com';
export const DEFAULT_NOREPLY_EMAIL = 'noreply@primestockug.com';
export const DEFAULT_SUPPORT_EMAIL = 'support@primestockug.com';

export function getPublicAppOrigin(): string {
  const configured =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_APP_URL
      ? String(import.meta.env.VITE_PUBLIC_APP_URL).trim()
      : '';
  const base = configured || CANONICAL_ORIGIN;
  return base.replace(/\/+$/, '');
}

export function buildCanonicalAppUrl(path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicAppOrigin()}${normalizedPath === '/' ? '/' : normalizedPath}`;
}

export function getCanonicalPageUrl(pathname = '/'): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${CANONICAL_ORIGIN}${normalizedPath}`;
}
