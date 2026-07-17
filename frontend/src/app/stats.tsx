import { Redirect } from 'expo-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StatsFilters, StatsResponse } from 'shared/types';

import SlidePanel from '../components/SlidePanel';
import StatsFiltersBar from '../components/StatsFilters';
import StatsSettingsPanel from '../components/StatsSettingsPanel';
import { useAuth } from '../lib/auth';
import { type BottomBarItem, useSetBottomBarItems } from '../lib/bottomBar';
import { fetchStats } from '../lib/stats';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

// Lazy-load the charts so `victory-native`/`react-native-skia` is only imported
// once Skia's CanvasKit is ready. On web that means awaiting the wasm load
// first; on native Skia is built in, so we import straight away.
const LazyStatsCharts = lazy(async () => {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import(
      '@shopify/react-native-skia/lib/module/web'
    );
    await LoadSkiaWeb({ locateFile: (file) => `/${file}` });
  }
  return import('../components/StatsCharts');
});

export default function StatsScreen() {
  const palette = usePalette();
  const { isAuthenticated } = useAuth();

  // `panel` keeps its last value while the sidebar animates closed, so the
  // exit doesn't flash the other panel's content; only `open` flips on close.
  const [panelState, setPanelState] = useState<{
    panel: 'filters' | 'settings';
    open: boolean;
  }>({ panel: 'filters', open: false });
  const activePanel = panelState.open ? panelState.panel : null;
  const [filters, setFilters] = useState<StatsFilters>({});
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchStats(filters, ac.signal)
      .then((data) => {
        setStats(data);
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load stats');
      })
      .finally(() => {
        setLoading(false);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, filtersKey]);

  const handleChange = useCallback((changed: Partial<StatsFilters>) => {
    setFilters((prev) => ({ ...prev, ...changed }));
  }, []);

  const togglePanel = useCallback(
    (next: 'filters' | 'settings') =>
      setPanelState((s) =>
        s.open && s.panel === next
          ? { ...s, open: false }
          : { panel: next, open: true },
      ),
    [],
  );

  // Publish this screen's actions into the shared bottom bar (left-justified).
  const barItems = useMemo<BottomBarItem[]>(
    () => [
      {
        key: 'filters',
        icon: 'filter-list-alt',
        label: 'Filters',
        active: activePanel === 'filters',
        onPress: () => togglePanel('filters'),
      },
      {
        key: 'settings',
        icon: 'settings',
        label: 'Settings',
        active: activePanel === 'settings',
        onPress: () => togglePanel('settings'),
      },
    ],
    [activePanel, togglePanel],
  );
  useSetBottomBarItems(barItems);

  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <View style={styles.body}>
        <SlidePanel
          visible={panelState.open}
          onClose={() => setPanelState((s) => ({ ...s, open: false }))}
          title={panelState.panel === 'settings' ? 'Stats settings' : 'Filters'}
        >
          {panelState.panel === 'settings' ? (
            <StatsSettingsPanel />
          ) : (
            <ScrollView style={{ flex: 1 }}>
              <StatsFiltersBar
                filters={filters}
                onChange={handleChange}
                palette={palette}
              />
            </ScrollView>
          )}
        </SlidePanel>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scroll}
        >
          {loading && !stats ? (
            <Text style={[styles.message, { color: palette.textSecondary }]}>
              Loading…
            </Text>
          ) : error ? (
            <Text style={[styles.message, { color: palette.error }]}>
              {error}
            </Text>
          ) : !stats ? null : (
            <Suspense
              fallback={
                <Text
                  style={[styles.message, { color: palette.textSecondary }]}
                >
                  Loading…
                </Text>
              }
            >
              <LazyStatsCharts stats={stats} />
            </Suspense>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  scroll: {
    padding: SPACING.MEDIUM,
    gap: SPACING.MEDIUM,
    paddingBottom: SPACING.HUGE,
  },
  message: {
    fontSize: FONT_SIZES.SMALL,
    textAlign: 'center',
    paddingVertical: SPACING.LARGE,
  },
});
