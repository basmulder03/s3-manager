import { create } from 'zustand';

interface UiState {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const resolveInitialTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem('ui-theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
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
}));
