import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const STEP = 1;

interface FontSizeStore {
  fontSize: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
}

export const useFontSizeStore = create<FontSizeStore>()(
  persist(
    (set) => ({
      fontSize: DEFAULT_FONT_SIZE,
      increase: () =>
        set((s) => ({ fontSize: Math.min(MAX_FONT_SIZE, s.fontSize + STEP) })),
      decrease: () =>
        set((s) => ({ fontSize: Math.max(MIN_FONT_SIZE, s.fontSize - STEP) })),
      reset: () => set({ fontSize: DEFAULT_FONT_SIZE }),
    }),
    { name: "dispatcher-font-size" }
  )
);
