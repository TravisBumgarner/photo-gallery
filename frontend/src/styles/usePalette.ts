import type { ThemeColors } from './theme';
import { useTheme } from './useTheme';

export type Palette = ThemeColors;

/** Compat shim: the active theme's colors. Prefer useTheme() in new code. */
export function usePalette(): Palette {
  return useTheme().colors;
}
