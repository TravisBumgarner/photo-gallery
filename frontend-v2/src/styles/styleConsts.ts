export const SPACING = {
  TINY: 4,
  SMALL: 10,
  MEDIUM: 20,
  LARGE: 36,
  HUGE: 48,
} as const;

export const FONT_SIZES = {
  TINY: 10,
  SMALL: 12,
  MEDIUM: 16,
  LARGE: 24,
  HUGE: 32,
} as const;

export const BORDER_RADIUS = {
  ZERO: 0,
} as const;

export const PALETTE = {
  grayscale: {
    0: 'hsl(0, 0%, 100%)',
    50: 'hsl(0, 0%, 95%)',
    100: 'hsl(0, 0%, 90%)',
    200: 'hsl(0, 0%, 80%)',
    300: 'hsl(0, 0%, 70%)',
    400: 'hsl(0, 0%, 60%)',
    500: 'hsl(0, 0%, 50%)',
    600: 'hsl(0, 0%, 40%)',
    700: 'hsl(0, 0%, 30%)',
    800: 'hsl(0, 0%, 20%)',
    850: 'hsl(0, 0%, 15%)',
    900: 'hsl(0, 0%, 10%)',
    1000: 'hsl(0, 0%, 0%)',
  },
  red: {
    500: 'hsl(0, 70%, 50%)',
    600: 'hsl(0, 70%, 45%)',
  },
} as const;

// Semantic role names mirror the legacy MUI theme (frontend/src/styles/Theme.tsx)
// so components can port over without re-mapping color slots.
export const LIGHT_PALETTE = {
  background: PALETTE.grayscale[0],
  backgroundSubtle: PALETTE.grayscale[100],
  surface: PALETTE.grayscale[50],
  surfaceElevated: PALETTE.grayscale[100],
  textPrimary: PALETTE.grayscale[900],
  textSecondary: PALETTE.grayscale[700],
  divider: PALETTE.grayscale[200],
  primary: PALETTE.grayscale[900],
  primaryContrast: PALETTE.grayscale[0],
  error: PALETTE.red[600],
} as const;

export const DARK_PALETTE = {
  background: PALETTE.grayscale[900],
  backgroundSubtle: PALETTE.grayscale[850],
  surface: PALETTE.grayscale[800],
  surfaceElevated: PALETTE.grayscale[850],
  textPrimary: PALETTE.grayscale[100],
  textSecondary: PALETTE.grayscale[200],
  divider: PALETTE.grayscale[800],
  primary: PALETTE.grayscale[200],
  primaryContrast: PALETTE.grayscale[900],
  error: PALETTE.red[500],
} as const;

export type Palette = { readonly [K in keyof typeof LIGHT_PALETTE]: string };

export const FORM_MAX_WIDTH = 400;
