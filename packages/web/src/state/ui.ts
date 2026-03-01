import { create } from 'zustand';

export const THEME_OPTIONS = ['light', 'dark'] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number];
export type LocaleId = string;

interface UiState {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
}

const isThemeId = (value: string | null): value is ThemeId =>
  value !== null && THEME_OPTIONS.includes(value as ThemeId);

const resolveInitialTheme = (): ThemeId => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem('ui-theme');
  if (isThemeId(stored)) {
    return stored;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
};

const resolveInitialLocale = (): LocaleId => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const stored = window.localStorage.getItem('ui-locale');
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return stored;
  }

  return 'en';
};

export const useUiStore = create<UiState>((set) => ({
  selectedPath: '',
  setSelectedPath: (selectedPath: string) => set({ selectedPath }),
  theme: resolveInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ui-theme', theme);
    }
    set({ theme });
  },
  locale: resolveInitialLocale(),
  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ui-locale', locale);
    }
    set({ locale });
  },
}));
