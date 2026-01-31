import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  BORDER_RADIUS,
  BUTTON_STYLES,
  FONT_SIZES,
  PALETTE,
} from './styleConsts';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: PALETTE.grayscale[200],
      contrastText: PALETTE.grayscale[900],
    },
    background: {
      default: PALETTE.grayscale[900],
      paper: PALETTE.grayscale[800],
    },
    text: {
      primary: PALETTE.grayscale[100],
      secondary: PALETTE.grayscale[200],
    },
    divider: PALETTE.grayscale[800],
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 900 },
    h2: { fontWeight: 900 },
    h3: { fontWeight: 900 },
    body2: { fontSize: FONT_SIZES.SMALL.PX },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: BORDER_RADIUS.ZERO.INT,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        contained: {
          fontWeight: 900,
          color: BUTTON_STYLES.color,
          backgroundColor: BUTTON_STYLES.background,
          '&:hover': { backgroundColor: BUTTON_STYLES.hoverBackground },
          '&:disabled': { backgroundColor: PALETTE.grayscale[700] },
        },
        outlined: {
          fontWeight: 600,
          color: PALETTE.grayscale[100],
          borderColor: PALETTE.grayscale[200],
          '&:hover': { backgroundColor: PALETTE.grayscale[700] },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', borderRadius: BORDER_RADIUS.ZERO.INT },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: BORDER_RADIUS.ZERO.INT },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: BORDER_RADIUS.ZERO.INT },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: PALETTE.grayscale[800],
          borderRadius: BORDER_RADIUS.ZERO.INT,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: PALETTE.grayscale[850],
          borderRadius: BORDER_RADIUS.ZERO.INT,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: BORDER_RADIUS.ZERO.INT,
          color: PALETTE.grayscale[200],
          '&:hover': { color: PALETTE.grayscale[100] },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: PALETTE.grayscale[800] },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: BORDER_RADIUS.ZERO.INT,
          color: PALETTE.grayscale[200],
          '& .MuiOutlinedInput-notchedOutline': {
            border: 'none',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            border: 'none',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            border: 'none',
          },
        },
        input: {
          padding: '4px 8px',
          fontSize: FONT_SIZES.SMALL.PX,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { '&.Mui-focused': { color: PALETTE.grayscale[200] } },
      },
    },
    MuiSelect: {
      defaultProps: {
        variant: 'standard',
        disableUnderline: true,
      },
      styleOverrides: {
        root: {
          borderRadius: BORDER_RADIUS.ZERO.INT,
          fontSize: FONT_SIZES.SMALL.PX,
        },
        select: {
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: PALETTE.grayscale[700],
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: FONT_SIZES.SMALL.PX,
          minHeight: 'unset',
          padding: '4px 12px',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: BORDER_RADIUS.ZERO.INT },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        track: { borderRadius: BORDER_RADIUS.ZERO.INT },
        root: { borderRadius: BORDER_RADIUS.ZERO.INT },
      },
    },
  },
});

const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default AppThemeProvider;
