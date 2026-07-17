import type { ViewStyle } from 'react-native';

/**
 * The app's theming system. A Theme owns every visual-chrome decision —
 * colors, corner radii, border presence, shadows, and how panels sit on the
 * page — so switching themes changes the app's whole character, not just its
 * palette. Components consume tokens (never hardcoded radii/borders/shadows).
 *
 * - `gallery`  — museum minimalism: square corners, hairline borders, flat.
 * - `darkroom` — pro photo tool: always dark, tonal charcoal, amber accent.
 * - `atelier`  — soft studio: warm paper, borderless, floating with shadows.
 */

export type ThemeKey =
  | 'gallery'
  | 'darkroom'
  | 'atelier'
  | 'phosphor'
  | 'riso'
  | 'abyss'
  | 'solarized'
  | 'sakura'
  | 'forest'
  | 'ultraviolet'
  | 'newsprint'
  | 'bauhaus'
  | 'sorbet'
  | 'fjord'
  | 'mocha'
  | 'kodachrome';
export type ColorSchemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  backgroundSubtle: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  /** The accent. Doubles as the "active/selected" color everywhere. */
  primary: string;
  primaryContrast: string;
  error: string;
  /** Modal backdrop color. */
  scrim: string;
}

export interface Theme {
  key: ThemeKey;
  name: string;
  /** One-line tagline shown in the theme picker. */
  tagline: string;
  scheme: ColorSchemeName;
  colors: ThemeColors;
  radius: {
    /** Buttons, inputs, steppers. */
    control: number;
    /** Small chips / pills / toggles. */
    chip: number;
    /** Sectioned cards (collapsible sections, settings lists). */
    card: number;
    /** Sidebars, dialogs, large containers. */
    panel: number;
  };
  /** Chrome border width — 1 for bordered themes, 0 for borderless ones. */
  hairline: number;
  /**
   * Composite style fragments, MUI-`components`-style. Spread one onto the
   * matching container and it carries the theme's whole treatment (background,
   * border, radius, shadow). Override individual keys after spreading if a
   * call site needs to (e.g. an active border color).
   */
  surfaces: {
    /** Centered modal dialogs. */
    dialog: ViewStyle;
    /** Anchored menus / popovers. */
    popover: ViewStyle;
    /** Sectioned cards: collapsible filter sections, settings lists. */
    card: ViewStyle;
    /** Small dismissible/toggle chips. */
    chip: ViewStyle;
    /** The floating bottom bar. */
    bar: ViewStyle;
  };
  /**
   * Sidebars: `true` = detached card floating over the page (margin, radius,
   * shadow); `false` = flush column separated by a hairline divider.
   */
  floatingPanels: boolean;
  /** Animation durations (ms) shared by all animated chrome. */
  motion: { fast: number; base: number };
}

const MOTION = { fast: 140, base: 220 } as const;

// ── Gallery ──────────────────────────────────────────────────────────────────

const GALLERY_LIGHT: ThemeColors = {
  background: 'hsl(0, 0%, 100%)',
  backgroundSubtle: 'hsl(0, 0%, 90%)',
  surface: 'hsl(0, 0%, 95%)',
  surfaceElevated: 'hsl(0, 0%, 90%)',
  textPrimary: 'hsl(0, 0%, 10%)',
  textSecondary: 'hsl(0, 0%, 30%)',
  divider: 'hsl(0, 0%, 80%)',
  primary: 'hsl(0, 0%, 10%)',
  primaryContrast: 'hsl(0, 0%, 100%)',
  error: 'hsl(0, 70%, 45%)',
  scrim: 'rgba(0, 0, 0, 0.45)',
};

const GALLERY_DARK: ThemeColors = {
  background: 'hsl(0, 0%, 10%)',
  backgroundSubtle: 'hsl(0, 0%, 15%)',
  surface: 'hsl(0, 0%, 20%)',
  surfaceElevated: 'hsl(0, 0%, 15%)',
  textPrimary: 'hsl(0, 0%, 90%)',
  textSecondary: 'hsl(0, 0%, 80%)',
  divider: 'hsl(0, 0%, 20%)',
  primary: 'hsl(0, 0%, 80%)',
  primaryContrast: 'hsl(0, 0%, 10%)',
  error: 'hsl(0, 70%, 50%)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

function gallery(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? GALLERY_DARK : GALLERY_LIGHT;
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 0,
  };
  return {
    key: 'gallery',
    name: 'Gallery',
    tagline: 'Stark and square. The photos are the color.',
    scheme,
    colors,
    radius: { control: 0, chip: 0, card: 0, panel: 0 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed },
      popover: { ...framed },
      card: { ...framed },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Darkroom ─────────────────────────────────────────────────────────────────

// One palette for both schemes: a darkroom has the lights off.
const DARKROOM_COLORS: ThemeColors = {
  background: 'hsl(220, 6%, 10%)',
  backgroundSubtle: 'hsl(220, 6%, 13%)',
  surface: 'hsl(220, 6%, 14%)',
  surfaceElevated: 'hsl(220, 6%, 19%)',
  textPrimary: 'hsl(220, 10%, 88%)',
  textSecondary: 'hsl(220, 6%, 60%)',
  divider: 'hsl(220, 6%, 23%)',
  primary: 'hsl(207, 70%, 60%)',
  primaryContrast: 'hsl(210, 40%, 8%)',
  error: 'hsl(0, 70%, 55%)',
  scrim: 'rgba(0, 0, 0, 0.65)',
};

function darkroom(scheme: ColorSchemeName): Theme {
  const colors = DARKROOM_COLORS;
  const shadow = '0px 8px 24px rgba(0, 0, 0, 0.5)';
  return {
    key: 'darkroom',
    name: 'Darkroom',
    tagline: 'Charcoal and steel blue, like the editing bay.',
    scheme,
    colors,
    radius: { control: 6, chip: 6, card: 8, panel: 10 },
    hairline: 1,
    surfaces: {
      dialog: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: 10,
        boxShadow: shadow,
      },
      popover: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: 8,
        boxShadow: shadow,
      },
      card: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: 8,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: 6,
      },
      bar: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.divider,
        borderRadius: 10,
        boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.5)',
      },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Atelier ──────────────────────────────────────────────────────────────────

const ATELIER_LIGHT: ThemeColors = {
  background: 'hsl(40, 33%, 96%)',
  backgroundSubtle: 'hsl(40, 28%, 92%)',
  surface: 'hsl(40, 40%, 99%)',
  surfaceElevated: 'hsl(40, 30%, 93%)',
  textPrimary: 'hsl(25, 25%, 16%)',
  textSecondary: 'hsl(25, 12%, 42%)',
  divider: 'hsl(35, 16%, 87%)',
  primary: 'hsl(14, 65%, 48%)',
  primaryContrast: 'hsl(40, 40%, 98%)',
  error: 'hsl(0, 65%, 48%)',
  scrim: 'rgba(35, 25, 15, 0.4)',
};

const ATELIER_DARK: ThemeColors = {
  background: 'hsl(25, 12%, 11%)',
  backgroundSubtle: 'hsl(25, 10%, 14%)',
  surface: 'hsl(25, 12%, 16%)',
  surfaceElevated: 'hsl(25, 10%, 21%)',
  textPrimary: 'hsl(35, 25%, 90%)',
  textSecondary: 'hsl(30, 10%, 62%)',
  divider: 'hsl(25, 10%, 24%)',
  primary: 'hsl(18, 70%, 60%)',
  primaryContrast: 'hsl(25, 30%, 10%)',
  error: 'hsl(0, 65%, 58%)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

function atelier(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? ATELIER_DARK : ATELIER_LIGHT;
  const softShadow =
    scheme === 'dark'
      ? '0px 8px 32px rgba(0, 0, 0, 0.45)'
      : '0px 8px 32px rgba(60, 40, 20, 0.14)';
  const liftShadow =
    scheme === 'dark'
      ? '0px 2px 12px rgba(0, 0, 0, 0.35)'
      : '0px 2px 12px rgba(60, 40, 20, 0.10)';
  return {
    key: 'atelier',
    name: 'Atelier',
    tagline: 'Warm, rounded, and floating on paper.',
    scheme,
    colors,
    radius: { control: 12, chip: 999, card: 16, panel: 22 },
    hairline: 0,
    surfaces: {
      dialog: {
        backgroundColor: colors.surface,
        borderRadius: 22,
        boxShadow: softShadow,
      },
      popover: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        boxShadow: softShadow,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        boxShadow: liftShadow,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 999,
      },
      bar: {
        backgroundColor: colors.surface,
        borderRadius: 999,
        boxShadow: softShadow,
      },
    },
    floatingPanels: true,
    motion: MOTION,
  };
}

// ── Phosphor ─────────────────────────────────────────────────────────────────

// One palette for both schemes: a CRT doesn't do daylight.
const PHOSPHOR_COLORS: ThemeColors = {
  background: 'hsl(160, 30%, 4%)',
  backgroundSubtle: 'hsl(160, 24%, 7%)',
  surface: 'hsl(160, 22%, 8%)',
  surfaceElevated: 'hsl(160, 20%, 12%)',
  textPrimary: 'hsl(140, 35%, 85%)',
  textSecondary: 'hsl(140, 25%, 55%)',
  divider: 'hsl(145, 45%, 20%)',
  primary: 'hsl(140, 95%, 60%)',
  primaryContrast: 'hsl(160, 40%, 5%)',
  error: 'hsl(10, 90%, 60%)',
  scrim: 'rgba(0, 12, 6, 0.78)',
};

function phosphor(scheme: ColorSchemeName): Theme {
  const colors = PHOSPHOR_COLORS;
  const glow = '0px 0px 14px rgba(70, 255, 150, 0.22)';
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 2,
  };
  return {
    key: 'phosphor',
    name: 'Phosphor',
    tagline: 'Green glow on glass, like the lab monitor.',
    scheme,
    colors,
    radius: { control: 2, chip: 2, card: 2, panel: 2 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed, borderColor: colors.primary, boxShadow: glow },
      popover: { ...framed, borderColor: colors.primary, boxShadow: glow },
      card: { ...framed },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed, boxShadow: glow },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Riso ─────────────────────────────────────────────────────────────────────

const RISO_LIGHT: ThemeColors = {
  background: 'hsl(48, 45%, 94%)',
  backgroundSubtle: 'hsl(48, 35%, 89%)',
  surface: 'hsl(48, 50%, 97%)',
  surfaceElevated: 'hsl(48, 40%, 90%)',
  textPrimary: 'hsl(240, 25%, 12%)',
  textSecondary: 'hsl(240, 12%, 35%)',
  divider: 'hsl(240, 25%, 12%)',
  primary: 'hsl(230, 90%, 56%)',
  primaryContrast: 'hsl(48, 50%, 97%)',
  error: 'hsl(350, 90%, 48%)',
  scrim: 'rgba(30, 30, 60, 0.45)',
};

const RISO_DARK: ThemeColors = {
  background: 'hsl(240, 18%, 10%)',
  backgroundSubtle: 'hsl(240, 15%, 13%)',
  surface: 'hsl(240, 16%, 14%)',
  surfaceElevated: 'hsl(240, 14%, 19%)',
  textPrimary: 'hsl(48, 45%, 92%)',
  textSecondary: 'hsl(48, 15%, 65%)',
  divider: 'hsl(48, 45%, 92%)',
  primary: 'hsl(335, 95%, 62%)',
  primaryContrast: 'hsl(240, 20%, 8%)',
  error: 'hsl(350, 90%, 60%)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

function riso(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? RISO_DARK : RISO_LIGHT;
  // The riso look: thick ink borders and a hard offset "print" shadow —
  // divider doubles as the ink color, so every border is loud on purpose.
  const ink = colors.divider;
  const stamp = (offset: number): ViewStyle => ({
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 4,
    boxShadow: `${offset}px ${offset}px 0px ${ink}`,
  });
  return {
    key: 'riso',
    name: 'Riso',
    tagline: 'Ink-stamped paper. Loud borders, hard shadows.',
    scheme,
    colors,
    radius: { control: 4, chip: 4, card: 4, panel: 4 },
    hairline: 2,
    surfaces: {
      dialog: stamp(6),
      popover: stamp(4),
      card: stamp(3),
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: ink,
        borderRadius: 4,
      },
      bar: stamp(4),
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Abyss ────────────────────────────────────────────────────────────────────

// One palette for both schemes: there is no daylight at this depth.
const ABYSS_COLORS: ThemeColors = {
  background: 'hsl(215, 55%, 8%)',
  backgroundSubtle: 'hsl(215, 48%, 11%)',
  surface: 'hsl(214, 45%, 14%)',
  surfaceElevated: 'hsl(213, 42%, 18%)',
  textPrimary: 'hsl(200, 40%, 90%)',
  textSecondary: 'hsl(205, 25%, 62%)',
  divider: 'hsl(213, 40%, 22%)',
  primary: 'hsl(185, 90%, 55%)',
  primaryContrast: 'hsl(215, 60%, 7%)',
  error: 'hsl(355, 80%, 62%)',
  scrim: 'rgba(2, 8, 20, 0.72)',
};

function abyss(scheme: ColorSchemeName): Theme {
  const colors = ABYSS_COLORS;
  const deep = '0px 16px 48px rgba(0, 4, 14, 0.65)';
  const drift = '0px 8px 28px rgba(0, 4, 14, 0.5)';
  return {
    key: 'abyss',
    name: 'Abyss',
    tagline: 'Deep water light. Everything floats down here.',
    scheme,
    colors,
    radius: { control: 14, chip: 14, card: 14, panel: 14 },
    hairline: 0,
    surfaces: {
      dialog: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        boxShadow: deep,
      },
      popover: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
        boxShadow: deep,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        boxShadow: drift,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
      },
      bar: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
        boxShadow: drift,
      },
    },
    floatingPanels: true,
    motion: MOTION,
  };
}

// ── Solarized ────────────────────────────────────────────────────────────────

const SOLARIZED_LIGHT: ThemeColors = {
  background: 'hsl(44, 87%, 94%)',
  backgroundSubtle: 'hsl(45, 60%, 89%)',
  surface: 'hsl(44, 70%, 91%)',
  surfaceElevated: 'hsl(45, 50%, 86%)',
  textPrimary: 'hsl(195, 23%, 40%)',
  textSecondary: 'hsl(180, 9%, 52%)',
  divider: 'hsl(46, 42%, 80%)',
  primary: 'hsl(18, 89%, 50%)',
  primaryContrast: 'hsl(44, 87%, 96%)',
  error: 'hsl(1, 71%, 52%)',
  scrim: 'rgba(0, 43, 54, 0.4)',
};

const SOLARIZED_DARK: ThemeColors = {
  background: 'hsl(192, 100%, 11%)',
  backgroundSubtle: 'hsl(192, 90%, 13%)',
  surface: 'hsl(192, 81%, 14%)',
  surfaceElevated: 'hsl(192, 60%, 18%)',
  textPrimary: 'hsl(186, 8%, 65%)',
  textSecondary: 'hsl(194, 14%, 48%)',
  divider: 'hsl(192, 50%, 22%)',
  primary: 'hsl(18, 89%, 55%)',
  primaryContrast: 'hsl(192, 100%, 8%)',
  error: 'hsl(1, 71%, 58%)',
  scrim: 'rgba(0, 10, 13, 0.65)',
};

function solarized(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? SOLARIZED_DARK : SOLARIZED_LIGHT;
  const subtle =
    scheme === 'dark'
      ? '0px 2px 8px rgba(0, 10, 13, 0.4)'
      : '0px 2px 8px rgba(101, 123, 131, 0.18)';
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 6,
  };
  return {
    key: 'solarized',
    name: 'Solarized',
    tagline: 'The sixteen colors that never went out of style.',
    scheme,
    colors,
    radius: { control: 6, chip: 6, card: 6, panel: 6 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed, boxShadow: subtle },
      popover: { ...framed, boxShadow: subtle },
      card: { ...framed },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed, boxShadow: subtle },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Sakura ───────────────────────────────────────────────────────────────────

const SAKURA_LIGHT: ThemeColors = {
  background: 'hsl(345, 60%, 97%)',
  backgroundSubtle: 'hsl(345, 45%, 94%)',
  surface: 'hsl(0, 0%, 100%)',
  surfaceElevated: 'hsl(345, 50%, 95%)',
  textPrimary: 'hsl(340, 25%, 22%)',
  textSecondary: 'hsl(340, 12%, 48%)',
  divider: 'hsl(345, 35%, 90%)',
  primary: 'hsl(340, 70%, 60%)',
  primaryContrast: 'hsl(345, 60%, 98%)',
  error: 'hsl(0, 75%, 55%)',
  scrim: 'rgba(60, 20, 35, 0.35)',
};

const SAKURA_DARK: ThemeColors = {
  background: 'hsl(330, 25%, 11%)',
  backgroundSubtle: 'hsl(330, 22%, 14%)',
  surface: 'hsl(330, 22%, 16%)',
  surfaceElevated: 'hsl(330, 20%, 21%)',
  textPrimary: 'hsl(345, 40%, 90%)',
  textSecondary: 'hsl(340, 18%, 65%)',
  divider: 'hsl(330, 18%, 25%)',
  primary: 'hsl(345, 80%, 72%)',
  primaryContrast: 'hsl(330, 30%, 10%)',
  error: 'hsl(0, 75%, 62%)',
  scrim: 'rgba(15, 5, 12, 0.65)',
};

function sakura(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? SAKURA_DARK : SAKURA_LIGHT;
  const feather =
    scheme === 'dark'
      ? '0px 10px 40px rgba(0, 0, 0, 0.4)'
      : '0px 10px 40px rgba(200, 120, 150, 0.18)';
  const petal =
    scheme === 'dark'
      ? '0px 3px 16px rgba(0, 0, 0, 0.3)'
      : '0px 3px 16px rgba(200, 120, 150, 0.12)';
  return {
    key: 'sakura',
    name: 'Sakura',
    tagline: 'Petal-soft pinks, light as spring air.',
    scheme,
    colors,
    radius: { control: 18, chip: 999, card: 18, panel: 18 },
    hairline: 0,
    surfaces: {
      dialog: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        boxShadow: feather,
      },
      popover: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        boxShadow: feather,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        boxShadow: petal,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 999,
      },
      bar: {
        backgroundColor: colors.surface,
        borderRadius: 999,
        boxShadow: feather,
      },
    },
    floatingPanels: true,
    motion: MOTION,
  };
}

// ── Forest ───────────────────────────────────────────────────────────────────

const FOREST_LIGHT: ThemeColors = {
  background: 'hsl(90, 20%, 93%)',
  backgroundSubtle: 'hsl(95, 18%, 89%)',
  surface: 'hsl(90, 25%, 96%)',
  surfaceElevated: 'hsl(95, 18%, 89%)',
  textPrimary: 'hsl(140, 30%, 14%)',
  textSecondary: 'hsl(135, 15%, 36%)',
  divider: 'hsl(95, 14%, 80%)',
  primary: 'hsl(42, 60%, 42%)',
  primaryContrast: 'hsl(45, 40%, 97%)',
  error: 'hsl(5, 70%, 45%)',
  scrim: 'rgba(15, 30, 20, 0.45)',
};

const FOREST_DARK: ThemeColors = {
  background: 'hsl(145, 25%, 8%)',
  backgroundSubtle: 'hsl(145, 22%, 11%)',
  surface: 'hsl(145, 20%, 12%)',
  surfaceElevated: 'hsl(142, 18%, 16%)',
  textPrimary: 'hsl(45, 35%, 88%)',
  textSecondary: 'hsl(90, 12%, 60%)',
  divider: 'hsl(142, 16%, 20%)',
  primary: 'hsl(42, 60%, 50%)',
  primaryContrast: 'hsl(145, 30%, 8%)',
  error: 'hsl(5, 70%, 58%)',
  scrim: 'rgba(4, 12, 8, 0.7)',
};

function forest(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? FOREST_DARK : FOREST_LIGHT;
  const canopy =
    scheme === 'dark'
      ? '0px 4px 18px rgba(2, 8, 5, 0.5)'
      : '0px 4px 18px rgba(30, 50, 35, 0.12)';
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
  };
  return {
    key: 'forest',
    name: 'Forest',
    tagline: 'Moss and brass, deep under the canopy.',
    scheme,
    colors,
    radius: { control: 8, chip: 8, card: 8, panel: 8 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed, boxShadow: canopy },
      popover: { ...framed, boxShadow: canopy },
      card: { ...framed },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed, boxShadow: canopy },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Ultraviolet ──────────────────────────────────────────────────────────────

// One palette for both schemes: the synthwave sun never rises.
const ULTRAVIOLET_COLORS: ThemeColors = {
  background: 'hsl(270, 40%, 6%)',
  backgroundSubtle: 'hsl(270, 35%, 9%)',
  surface: 'hsl(268, 32%, 10%)',
  surfaceElevated: 'hsl(266, 30%, 14%)',
  textPrimary: 'hsl(285, 40%, 90%)',
  textSecondary: 'hsl(280, 20%, 62%)',
  divider: 'hsl(275, 45%, 24%)',
  primary: 'hsl(300, 95%, 60%)',
  primaryContrast: 'hsl(270, 45%, 6%)',
  error: 'hsl(340, 95%, 60%)',
  scrim: 'rgba(10, 2, 18, 0.78)',
};

function ultraviolet(scheme: ColorSchemeName): Theme {
  const colors = ULTRAVIOLET_COLORS;
  const glow = '0px 0px 16px rgba(230, 60, 240, 0.28)';
  const haze = '0px 0px 10px rgba(160, 60, 240, 0.2)';
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 6,
  };
  return {
    key: 'ultraviolet',
    name: 'Ultraviolet',
    tagline: 'Neon magenta on midnight purple. Drive fast.',
    scheme,
    colors,
    radius: { control: 6, chip: 6, card: 6, panel: 6 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed, borderColor: colors.primary, boxShadow: glow },
      popover: { ...framed, borderColor: colors.primary, boxShadow: glow },
      card: { ...framed, boxShadow: haze },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed, boxShadow: glow },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Newsprint ────────────────────────────────────────────────────────────────

const NEWSPRINT_LIGHT: ThemeColors = {
  background: 'hsl(40, 20%, 96%)',
  backgroundSubtle: 'hsl(40, 15%, 92%)',
  surface: 'hsl(40, 22%, 97%)',
  surfaceElevated: 'hsl(40, 15%, 92%)',
  textPrimary: 'hsl(0, 0%, 8%)',
  textSecondary: 'hsl(0, 0%, 38%)',
  divider: 'hsl(0, 0%, 55%)',
  primary: 'hsl(355, 75%, 45%)',
  primaryContrast: 'hsl(40, 20%, 97%)',
  error: 'hsl(355, 75%, 40%)',
  scrim: 'rgba(20, 20, 20, 0.5)',
};

const NEWSPRINT_DARK: ThemeColors = {
  background: 'hsl(0, 0%, 8%)',
  backgroundSubtle: 'hsl(0, 0%, 12%)',
  surface: 'hsl(0, 0%, 10%)',
  surfaceElevated: 'hsl(0, 0%, 15%)',
  textPrimary: 'hsl(40, 15%, 92%)',
  textSecondary: 'hsl(40, 8%, 65%)',
  divider: 'hsl(0, 0%, 42%)',
  primary: 'hsl(355, 75%, 55%)',
  primaryContrast: 'hsl(0, 0%, 8%)',
  error: 'hsl(355, 75%, 60%)',
  scrim: 'rgba(0, 0, 0, 0.7)',
};

function newsprint(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? NEWSPRINT_DARK : NEWSPRINT_LIGHT;
  // Thin column rules everywhere, zero shadow: flat as the morning edition.
  const ruled: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 0,
  };
  return {
    key: 'newsprint',
    name: 'Newsprint',
    tagline: 'Ink on paper, ruled into columns.',
    scheme,
    colors,
    radius: { control: 0, chip: 0, card: 0, panel: 0 },
    hairline: 1,
    surfaces: {
      dialog: { ...ruled },
      popover: { ...ruled },
      card: { ...ruled },
      chip: { ...ruled, backgroundColor: colors.surfaceElevated },
      bar: { ...ruled },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Bauhaus ──────────────────────────────────────────────────────────────────

const BAUHAUS_LIGHT: ThemeColors = {
  background: 'hsl(0, 0%, 99%)',
  backgroundSubtle: 'hsl(0, 0%, 94%)',
  surface: 'hsl(0, 0%, 100%)',
  surfaceElevated: 'hsl(0, 0%, 94%)',
  textPrimary: 'hsl(0, 0%, 7%)',
  textSecondary: 'hsl(0, 0%, 34%)',
  divider: 'hsl(0, 0%, 7%)',
  primary: 'hsl(4, 85%, 52%)',
  primaryContrast: 'hsl(0, 0%, 100%)',
  error: 'hsl(4, 85%, 45%)',
  scrim: 'rgba(0, 0, 0, 0.5)',
};

const BAUHAUS_DARK: ThemeColors = {
  background: 'hsl(0, 0%, 12%)',
  backgroundSubtle: 'hsl(0, 0%, 16%)',
  surface: 'hsl(0, 0%, 15%)',
  surfaceElevated: 'hsl(0, 0%, 20%)',
  textPrimary: 'hsl(0, 0%, 94%)',
  textSecondary: 'hsl(0, 0%, 68%)',
  divider: 'hsl(0, 0%, 94%)',
  primary: 'hsl(4, 85%, 55%)',
  primaryContrast: 'hsl(0, 0%, 100%)',
  error: 'hsl(4, 85%, 60%)',
  scrim: 'rgba(0, 0, 0, 0.7)',
};

function bauhaus(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? BAUHAUS_DARK : BAUHAUS_LIGHT;
  // Circle and square: hard 2px-ruled squares for panels, perfect-round chips.
  const ruled: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.divider,
    borderRadius: 0,
  };
  return {
    key: 'bauhaus',
    name: 'Bauhaus',
    tagline: 'Circle, square, red. Form is the function.',
    scheme,
    colors,
    radius: { control: 0, chip: 999, card: 0, panel: 0 },
    hairline: 2,
    surfaces: {
      dialog: { ...ruled },
      popover: { ...ruled },
      card: { ...ruled },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.divider,
        borderRadius: 999,
      },
      bar: { ...ruled },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Sorbet ───────────────────────────────────────────────────────────────────

const SORBET_LIGHT: ThemeColors = {
  background: 'hsl(28, 80%, 95%)',
  backgroundSubtle: 'hsl(150, 45%, 92%)',
  surface: 'hsl(30, 70%, 98%)',
  surfaceElevated: 'hsl(150, 40%, 93%)',
  textPrimary: 'hsl(15, 35%, 20%)',
  textSecondary: 'hsl(15, 18%, 45%)',
  divider: 'hsl(28, 45%, 88%)',
  primary: 'hsl(12, 85%, 62%)',
  primaryContrast: 'hsl(30, 80%, 98%)',
  error: 'hsl(350, 80%, 55%)',
  scrim: 'rgba(70, 35, 25, 0.35)',
};

const SORBET_DARK: ThemeColors = {
  background: 'hsl(335, 22%, 12%)',
  backgroundSubtle: 'hsl(335, 20%, 15%)',
  surface: 'hsl(335, 20%, 17%)',
  surfaceElevated: 'hsl(335, 18%, 22%)',
  textPrimary: 'hsl(25, 45%, 90%)',
  textSecondary: 'hsl(345, 15%, 66%)',
  divider: 'hsl(335, 16%, 26%)',
  primary: 'hsl(12, 85%, 66%)',
  primaryContrast: 'hsl(335, 25%, 10%)',
  error: 'hsl(350, 80%, 64%)',
  scrim: 'rgba(15, 6, 10, 0.65)',
};

function sorbet(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? SORBET_DARK : SORBET_LIGHT;
  const scoop =
    scheme === 'dark'
      ? '0px 12px 36px rgba(0, 0, 0, 0.45)'
      : '0px 12px 36px rgba(220, 120, 90, 0.2)';
  const dollop =
    scheme === 'dark'
      ? '0px 4px 18px rgba(0, 0, 0, 0.35)'
      : '0px 4px 18px rgba(220, 120, 90, 0.14)';
  return {
    key: 'sorbet',
    name: 'Sorbet',
    tagline: 'Peach and mint, two scoops, extra rounded.',
    scheme,
    colors,
    radius: { control: 24, chip: 999, card: 24, panel: 24 },
    hairline: 0,
    surfaces: {
      dialog: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        boxShadow: scoop,
      },
      popover: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        boxShadow: scoop,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        boxShadow: dollop,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 999,
      },
      bar: {
        backgroundColor: colors.surface,
        borderRadius: 999,
        boxShadow: scoop,
      },
    },
    floatingPanels: true,
    motion: MOTION,
  };
}

// ── Fjord ────────────────────────────────────────────────────────────────────

const FJORD_LIGHT: ThemeColors = {
  background: 'hsl(220, 25%, 95%)',
  backgroundSubtle: 'hsl(220, 20%, 91%)',
  surface: 'hsl(220, 27%, 98%)',
  surfaceElevated: 'hsl(220, 20%, 91%)',
  textPrimary: 'hsl(220, 16%, 22%)',
  textSecondary: 'hsl(220, 12%, 45%)',
  divider: 'hsl(220, 16%, 86%)',
  primary: 'hsl(193, 43%, 42%)',
  primaryContrast: 'hsl(220, 27%, 98%)',
  error: 'hsl(354, 42%, 50%)',
  scrim: 'rgba(35, 42, 55, 0.4)',
};

const FJORD_DARK: ThemeColors = {
  background: 'hsl(220, 16%, 18%)',
  backgroundSubtle: 'hsl(220, 16%, 21%)',
  surface: 'hsl(220, 16%, 23%)',
  surfaceElevated: 'hsl(220, 15%, 28%)',
  textPrimary: 'hsl(218, 27%, 90%)',
  textSecondary: 'hsl(219, 16%, 68%)',
  divider: 'hsl(220, 14%, 31%)',
  primary: 'hsl(193, 43%, 55%)',
  primaryContrast: 'hsl(220, 20%, 14%)',
  error: 'hsl(354, 50%, 62%)',
  scrim: 'rgba(10, 13, 18, 0.65)',
};

function fjord(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? FJORD_DARK : FJORD_LIGHT;
  // Separation is tonal: elevated surfaces do the work, shadows just whisper.
  const whisper =
    scheme === 'dark'
      ? '0px 2px 6px rgba(8, 10, 14, 0.25)'
      : '0px 2px 6px rgba(60, 70, 90, 0.08)';
  return {
    key: 'fjord',
    name: 'Fjord',
    tagline: 'Still water, slate sky. Nothing shouts.',
    scheme,
    colors,
    radius: { control: 10, chip: 10, card: 10, panel: 10 },
    hairline: 0,
    surfaces: {
      dialog: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 10,
        boxShadow: whisper,
      },
      popover: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 10,
        boxShadow: whisper,
      },
      card: {
        backgroundColor: colors.surface,
        borderRadius: 10,
      },
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 10,
      },
      bar: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: 10,
        boxShadow: whisper,
      },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Mocha ────────────────────────────────────────────────────────────────────

const MOCHA_LIGHT: ThemeColors = {
  background: 'hsl(32, 40%, 94%)',
  backgroundSubtle: 'hsl(32, 32%, 90%)',
  surface: 'hsl(32, 45%, 97%)',
  surfaceElevated: 'hsl(32, 32%, 90%)',
  textPrimary: 'hsl(25, 30%, 18%)',
  textSecondary: 'hsl(25, 15%, 42%)',
  divider: 'hsl(30, 22%, 86%)',
  primary: 'hsl(280, 35%, 50%)',
  primaryContrast: 'hsl(32, 45%, 97%)',
  error: 'hsl(2, 65%, 50%)',
  scrim: 'rgba(45, 30, 20, 0.4)',
};

const MOCHA_DARK: ThemeColors = {
  background: 'hsl(20, 15%, 11%)',
  backgroundSubtle: 'hsl(20, 14%, 14%)',
  surface: 'hsl(22, 14%, 15%)',
  surfaceElevated: 'hsl(24, 13%, 20%)',
  textPrimary: 'hsl(30, 25%, 88%)',
  textSecondary: 'hsl(28, 12%, 62%)',
  divider: 'hsl(24, 12%, 22%)',
  primary: 'hsl(280, 35%, 70%)',
  primaryContrast: 'hsl(20, 20%, 10%)',
  error: 'hsl(2, 65%, 60%)',
  scrim: 'rgba(8, 5, 3, 0.68)',
};

function mocha(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? MOCHA_DARK : MOCHA_LIGHT;
  const steam =
    scheme === 'dark'
      ? '0px 6px 22px rgba(10, 6, 3, 0.5)'
      : '0px 6px 22px rgba(80, 55, 35, 0.14)';
  const framed: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
  };
  return {
    key: 'mocha',
    name: 'Mocha',
    tagline: 'Warm brown, soft light, a corner table.',
    scheme,
    colors,
    radius: { control: 12, chip: 12, card: 12, panel: 12 },
    hairline: 1,
    surfaces: {
      dialog: { ...framed, boxShadow: steam },
      popover: { ...framed, boxShadow: steam },
      card: { ...framed },
      chip: { ...framed, backgroundColor: colors.surfaceElevated },
      bar: { ...framed, boxShadow: steam },
    },
    floatingPanels: false,
    motion: MOTION,
  };
}

// ── Kodachrome ───────────────────────────────────────────────────────────────

// The favicon's three bands — coral red, golden yellow, sky blue — turned up
// loud. Surfaces get a flat "band" shadow (0-blur bottom offset) echoing the
// icon's stripes.
const KODACHROME_LIGHT: ThemeColors = {
  background: 'hsl(45, 60%, 97%)',
  backgroundSubtle: 'hsl(200, 70%, 92%)',
  surface: 'hsl(0, 0%, 100%)',
  surfaceElevated: 'hsl(48, 90%, 88%)',
  textPrimary: 'hsl(220, 35%, 13%)',
  textSecondary: 'hsl(220, 15%, 38%)',
  divider: 'hsl(220, 35%, 13%)',
  primary: 'hsl(355, 85%, 52%)',
  primaryContrast: 'hsl(45, 60%, 98%)',
  error: 'hsl(25, 95%, 45%)',
  scrim: 'rgba(20, 35, 70, 0.5)',
};

const KODACHROME_DARK: ThemeColors = {
  background: 'hsl(215, 45%, 9%)',
  backgroundSubtle: 'hsl(215, 40%, 12%)',
  surface: 'hsl(215, 35%, 13%)',
  surfaceElevated: 'hsl(215, 30%, 18%)',
  textPrimary: 'hsl(45, 60%, 92%)',
  textSecondary: 'hsl(215, 15%, 65%)',
  divider: 'hsl(45, 60%, 92%)',
  primary: 'hsl(46, 95%, 55%)',
  primaryContrast: 'hsl(220, 40%, 10%)',
  error: 'hsl(355, 90%, 62%)',
  scrim: 'rgba(0, 5, 15, 0.7)',
};

function kodachrome(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? KODACHROME_DARK : KODACHROME_LIGHT;
  const red = scheme === 'dark' ? 'hsl(355, 85%, 58%)' : 'hsl(355, 85%, 52%)';
  const yellow = 'hsl(46, 95%, 55%)';
  const blue = scheme === 'dark' ? 'hsl(205, 80%, 55%)' : 'hsl(205, 75%, 45%)';
  const band = (color: string): ViewStyle => ({
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.divider,
    borderRadius: 10,
    boxShadow: `0px 4px 0px ${color}`,
  });
  return {
    key: 'kodachrome',
    name: 'Kodachrome',
    tagline: 'The favicon, turned all the way up.',
    scheme,
    colors,
    radius: { control: 8, chip: 999, card: 10, panel: 12 },
    hairline: 2,
    surfaces: {
      dialog: band(blue),
      popover: band(yellow),
      card: band(blue),
      chip: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.divider,
        borderRadius: 999,
      },
      bar: band(red),
    },
    floatingPanels: true,
    motion: MOTION,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

const BUILDERS: Record<ThemeKey, (scheme: ColorSchemeName) => Theme> = {
  gallery,
  darkroom,
  atelier,
  phosphor,
  riso,
  abyss,
  solarized,
  sakura,
  forest,
  ultraviolet,
  newsprint,
  bauhaus,
  sorbet,
  fjord,
  mocha,
  kodachrome,
};

export const THEME_KEYS: ThemeKey[] = [
  'gallery',
  'darkroom',
  'atelier',
  'phosphor',
  'riso',
  'abyss',
  'solarized',
  'sakura',
  'forest',
  'ultraviolet',
  'newsprint',
  'bauhaus',
  'sorbet',
  'fjord',
  'mocha',
  'kodachrome',
];

export const DEFAULT_THEME_KEY: ThemeKey = 'gallery';

export function isThemeKey(value: unknown): value is ThemeKey {
  return (
    typeof value === 'string' && (THEME_KEYS as string[]).includes(value)
  );
}

export function buildTheme(key: ThemeKey, scheme: ColorSchemeName): Theme {
  return BUILDERS[key](scheme);
}
