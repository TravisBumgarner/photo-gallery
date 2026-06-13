import { MaterialIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import type { StatsFilters, StatsResponse } from 'shared/types';

import SlidePanel from '../components/SlidePanel';
import StatsFiltersBar from '../components/StatsFilters';
import StatsSettingsPanel from '../components/StatsSettingsPanel';
import { useAuth } from '../lib/auth';
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
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const [activePanel, setActivePanel] = useState<'filters' | 'settings' | null>(
    null,
  );
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

  const togglePanel = (panel: 'filters' | 'settings') =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <View style={styles.body}>
        <SlidePanel
          visible={activePanel !== null}
          onClose={() => setActivePanel(null)}
          title={activePanel === 'settings' ? 'Stats settings' : 'Filters'}
        >
          {activePanel === 'settings' ? (
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

      <View
        style={[
          styles.floatingBar,
          { paddingBottom: insets.bottom + SPACING.SMALL },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.toolbar, { backgroundColor: palette.surface }]}>
          <ToolbarButton
            icon="filter-list-alt"
            label="Filters"
            active={activePanel === 'filters'}
            onPress={() => togglePanel('filters')}
            palette={palette}
          />
          <ToolbarButton
            icon="settings"
            label="Settings"
            active={activePanel === 'settings'}
            onPress={() => togglePanel('settings')}
            palette={palette}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onPress,
  palette,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.toolbarButton,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={20}
        color={active ? palette.primary : palette.textPrimary}
      />
      <Text style={[styles.toolbarCaption, { color: palette.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
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
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.MEDIUM,
    alignItems: 'center',
    pointerEvents: 'box-none',
    zIndex: 100,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderRadius: 999,
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
    elevation: 10,
  },
  toolbarButton: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: SPACING.TINY,
  },
  toolbarCaption: {
    fontSize: FONT_SIZES.TINY,
  },
});
