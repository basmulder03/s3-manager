import { create } from 'zustand';

interface UiState {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedPath: '',
  setSelectedPath: (selectedPath: string) => set({ selectedPath }),
}));
