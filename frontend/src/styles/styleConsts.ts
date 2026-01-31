export const PALETTE = {
  grayscale: {
    0: 'hsl(0 0% 100%)',
    50: 'hsl(0 0% 95%)',
    100: 'hsl(0 0% 90%)',
    200: 'hsl(0 0% 80%)',
    300: 'hsl(0 0% 70%)',
    400: 'hsl(0 0% 60%)',
    500: 'hsl(0 0% 50%)',
    600: 'hsl(0 0% 40%)',
    700: 'hsl(0 0% 30%)',
    800: 'hsl(0 0% 20%)',
    850: 'hsl(0 0% 15%)',
    900: 'hsl(0 0% 10%)',
    1000: 'hsl(0 0% 0%)',
  },
}

export const subtleBackground = (
  subtleness: 'very' | 'slightly' = 'very'
) => {
  if (subtleness === 'slightly') {
    return `color-mix(in hsl, ${PALETTE.grayscale[500]}, ${PALETTE.grayscale[900]} 90%)`
  }

  return `color-mix(in hsl, ${PALETTE.grayscale[800]}, ${PALETTE.grayscale[900]} 80%)`
}

export const BORDER_RADIUS = {
  ZERO: {
    PX: '0px',
    INT: 0,
  },
} as const

export const FONT_SIZES = {
  SMALL: {
    PX: '12px',
    INT: 12,
  },
  MEDIUM: {
    PX: '16px',
    INT: 16,
  },
  LARGE: {
    PX: '24px',
    INT: 24,
  },
  HUGE: {
    PX: '32px',
    INT: 32,
  },
} as const

export const SPACING = {
  TINY: {
    PX: '4px',
    INT: 4,
  },
  SMALL: {
    PX: '10px',
    INT: 10,
  },
  MEDIUM: {
    PX: '20px',
    INT: 20,
  },
  LARGE: {
    PX: '36px',
    INT: 36,
  },
  HUGE: {
    PX: '48px',
    INT: 48,
  },
} as const

export const BUTTON_STYLES = {
  color: PALETTE.grayscale[900],
  background: PALETTE.grayscale[200],
  hoverBackground: PALETTE.grayscale[100],
} as const
