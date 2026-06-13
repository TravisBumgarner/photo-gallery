import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from './src/styles/styleConsts';

const themeFromPalette = (p: Palette) => ({
  background: p.background,
  backgroundHover: p.surface,
  backgroundPress: p.surfaceElevated,
  backgroundFocus: p.surface,
  color: p.textPrimary,
  colorHover: p.textPrimary,
  colorPress: p.textPrimary,
  colorFocus: p.textPrimary,
  borderColor: p.divider,
  borderColorHover: p.primary,
  borderColorPress: p.primary,
  borderColorFocus: p.primary,
  placeholderColor: p.textSecondary,
});

// Sharp-corner brand: every radius token resolves to 0, so any component
// using $0..$12 or $true for borderRadius renders square.
const zeroRadius = Object.fromEntries(
  Object.keys(defaultConfig.tokens.radius).map((k) => [k, 0]),
) as typeof defaultConfig.tokens.radius;

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    radius: zeroRadius,
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, ...themeFromPalette(LIGHT_PALETTE) },
    dark: { ...defaultConfig.themes.dark, ...themeFromPalette(DARK_PALETTE) },
  },
});

export default tamaguiConfig;
export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
