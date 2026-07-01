/** Small UI state for the budgeting views: the year currently being viewed. */

import { create } from "zustand";

interface BudgetingUiState {
  currentYear: number;
  setYear: (year: number) => void;
  stepYear: (delta: number) => void;
}

export const useBudgetingUi = create<BudgetingUiState>((set) => ({
  currentYear: new Date().getFullYear(),
  setYear: (year) => set({ currentYear: year }),
  stepYear: (delta) => set((s) => ({ currentYear: s.currentYear + delta })),
}));
