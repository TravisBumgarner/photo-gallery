import { useColorScheme } from 'react-native';

import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from './styleConsts';

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}
