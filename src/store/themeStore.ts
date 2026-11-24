import { create } from 'zustand';
import { ThemePreference } from '../types';

const THEME_STORAGE_KEY = 'primestock_theme';

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyThemeToDom(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    root.dataset.theme = resolved;

    const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = resolved === 'dark' ? '#090F1A' : '#0B1F3A';
    }
  }
  return resolved;
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Ignore storage read errors
  }
  return 'system';
}

interface ThemeState {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
  syncSystemPreference: () => void;
}

const initialPreference = readStoredPreference();
const initialResolved = applyThemeToDom(initialPreference);

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolvedTheme: initialResolved,

  setPreference: (preference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore storage write errors
    }
    const resolvedTheme = applyThemeToDom(preference);
    set({ preference, resolvedTheme });
  },

  cyclePreference: () => {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(get().preference);
    const next = order[(idx + 1) % order.length];
    get().setPreference(next);
  },

  syncSystemPreference: () => {
    const current = get().preference;
    const resolvedTheme = applyThemeToDom(current);
    set({ resolvedTheme });
  },
}));

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    useThemeStore.getState().syncSystemPreference();
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onSystemChange);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(onSystemChange);
  }
}
