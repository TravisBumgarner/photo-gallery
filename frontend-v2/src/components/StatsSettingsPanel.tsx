import { MaterialIcons } from '@expo/vector-icons';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Sortable from 'react-native-sortables';

import {
  setStatsChartOrder,
  setStatsChartVisible,
  setStatsFilterOrder,
  setStatsFilterVisible,
  STATS_CHARTS,
  STATS_FILTERS,
  type StatsChartKey,
  type StatsFilterKey,
  useSettings,
} from '../lib/settings';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

const FILTER_LABELS: Record<StatsFilterKey, string> = Object.fromEntries(
  STATS_FILTERS.map((s) => [s.key, s.label]),
) as Record<StatsFilterKey, string>;

const CHART_LABELS: Record<StatsChartKey, string> = Object.fromEntries(
  STATS_CHARTS.map((s) => [s.key, s.label]),
) as Record<StatsChartKey, string>;

// react-native-web honours the `grab` cursor; RN's `CursorValue` type only
// allows auto/pointer, so cast past it for the web-only hint.
const GRAB_CURSOR = { cursor: 'grab' } as unknown as ViewStyle;

export default function StatsSettingsPanel() {
  const palette = usePalette();
  const settings = useSettings();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: SPACING.MEDIUM, gap: SPACING.MEDIUM }}
    >
      <View style={{ gap: SPACING.SMALL }}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          FILTERS
        </Text>
        <Text style={[styles.sectionHelp, { color: palette.textSecondary }]}>
          Toggle which filters appear in the sidebar, and drag the handle to
          reorder them.
        </Text>
        <Sortable.Grid
          columns={1}
          data={settings.statsFilterOrder}
          keyExtractor={(key) => key}
          rowGap={0}
          customHandle
          dragActivationDelay={0}
          onDragEnd={({ data }) => setStatsFilterOrder(data)}
          renderItem={({ item: key }) => (
            <SortRow
              label={FILTER_LABELS[key]}
              value={settings.visibleStatsFilters[key]}
              onValueChange={(next) => setStatsFilterVisible(key, next)}
              palette={palette}
            />
          )}
        />
      </View>

      <View style={{ gap: SPACING.SMALL }}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          CHARTS
        </Text>
        <Text style={[styles.sectionHelp, { color: palette.textSecondary }]}>
          Toggle which charts appear, and drag the handle to reorder them.
        </Text>
        <Sortable.Grid
          columns={1}
          data={settings.statsChartOrder}
          keyExtractor={(key) => key}
          rowGap={0}
          customHandle
          dragActivationDelay={0}
          onDragEnd={({ data }) => setStatsChartOrder(data)}
          renderItem={({ item: key }) => (
            <SortRow
              label={CHART_LABELS[key]}
              value={settings.visibleStatsCharts[key]}
              onValueChange={(next) => setStatsChartVisible(key, next)}
              palette={palette}
            />
          )}
        />
      </View>
    </ScrollView>
  );
}

function SortRow({
  label,
  value,
  onValueChange,
  palette,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View
      style={[
        styles.sortRow,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.divider,
        },
      ]}
    >
      <Sortable.Handle style={[styles.dragHandle, GRAB_CURSOR]}>
        <View pointerEvents="none">
          <MaterialIcons
            name="drag-indicator"
            size={18}
            color={palette.textSecondary}
          />
        </View>
      </Sortable.Handle>
      <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionHelp: {
    fontSize: FONT_SIZES.SMALL,
  },
  rowLabel: {
    fontSize: FONT_SIZES.SMALL,
    flex: 1,
  },
  sortRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingRight: SPACING.SMALL,
    borderBottomWidth: 1,
  },
  dragHandle: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
