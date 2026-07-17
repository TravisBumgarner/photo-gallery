import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSetting } from '../lib/settings';
import { buildTheme, type Theme } from './theme';

/**
 * The active theme: the user's picked theme family (settings) resolved
 * against the system light/dark scheme.
 *
 * Subscribes to themeKey ONLY — useTheme is mounted in nearly every
 * component, so a whole-settings subscription here would re-render the app
 * on unrelated settings writes (e.g. expanding a filter section).
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const themeKey = useSetting((s) => s.themeKey);
  return useMemo(
    () => buildTheme(themeKey, scheme === 'dark' ? 'dark' : 'light'),
    [themeKey, scheme],
  );
}
