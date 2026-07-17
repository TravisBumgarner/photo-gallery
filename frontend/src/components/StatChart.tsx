import { Bar, CartesianChart, Line } from 'victory-native';
import { StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';

interface BarChartProps {
  title: string;
  data: { label: string; value: number }[];
  height?: number;
}

const DEFAULT_HEIGHT = 220;

export function StatBarChart({
  title,
  data,
  height = DEFAULT_HEIGHT,
}: BarChartProps) {
  const theme = useTheme();
  const palette = theme.colors;

  if (data.length === 0) {
    return <EmptyCard title={title} theme={theme} />;
  }

  // Map to victory-native data format with numeric x for spacing
  const chartData = data.map((d, i) => ({ x: i, y: d.value }));

  // Bars follow the theme's corner language, clamped so wide bars stay bars.
  const barRadius = Math.min(theme.radius.control, 4);

  return (
    <Card title={title} theme={theme}>
      <View style={{ height }}>
        <CartesianChart data={chartData} xKey="x" yKeys={['y']}>
          {({ points, chartBounds }) => (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              color={palette.primary}
              roundedCorners={{ topLeft: barRadius, topRight: barRadius }}
            />
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        {data.slice(0, 8).map((d) => (
          <View key={d.label} style={styles.legendRow}>
            <Text
              style={[styles.legendLabel, { color: palette.textSecondary }]}
              numberOfLines={1}
            >
              {d.label}
            </Text>
            <Text style={[styles.legendValue, { color: palette.textPrimary }]}>
              {d.value.toLocaleString()}
            </Text>
          </View>
        ))}
        {data.length > 8 ? (
          <Text style={[styles.legendMore, { color: palette.textSecondary }]}>
            +{data.length - 8} more
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

interface LineChartProps {
  title: string;
  data: { label: string; value: number }[];
  height?: number;
}

export function StatLineChart({
  title,
  data,
  height = DEFAULT_HEIGHT,
}: LineChartProps) {
  const theme = useTheme();
  const palette = theme.colors;

  if (data.length === 0) {
    return <EmptyCard title={title} theme={theme} />;
  }

  const chartData = data.map((d, i) => ({ x: i, y: d.value }));

  return (
    <Card title={title} theme={theme}>
      <View style={{ height }}>
        <CartesianChart data={chartData} xKey="x" yKeys={['y']}>
          {({ points }) => (
            <Line
              points={points.y}
              color={palette.primary}
              strokeWidth={2}
              animate={{ type: 'timing', duration: 300 }}
            />
          )}
        </CartesianChart>
      </View>
      <View style={styles.rangeLabels}>
        <Text style={[styles.rangeLabel, { color: palette.textSecondary }]}>
          {data[0]?.label ?? ''}
        </Text>
        <Text style={[styles.rangeLabel, { color: palette.textSecondary }]}>
          {data[data.length - 1]?.label ?? ''}
        </Text>
      </View>
    </Card>
  );
}

interface KpiProps {
  title: string;
  value: number | string;
}

export function StatKpi({ title, value }: KpiProps) {
  const theme = useTheme();
  const palette = theme.colors;
  return (
    <Card title={title} theme={theme}>
      <Text style={[styles.kpi, { color: palette.textPrimary }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
    </Card>
  );
}

function Card({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  const palette = theme.colors;
  return (
    <View style={[styles.card, theme.surfaces.card]}>
      <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function EmptyCard({
  title,
  theme,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const palette = theme.colors;
  return (
    <Card title={title} theme={theme}>
      <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
        No data
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.MEDIUM,
    gap: SPACING.SMALL,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpi: {
    fontSize: FONT_SIZES.HUGE,
    fontWeight: '700',
  },
  legend: {
    gap: SPACING.TINY,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.SMALL,
  },
  legendLabel: {
    flex: 1,
    fontSize: FONT_SIZES.TINY,
  },
  legendValue: {
    fontSize: FONT_SIZES.TINY,
    fontVariant: ['tabular-nums'],
  },
  legendMore: {
    fontSize: FONT_SIZES.TINY,
    fontStyle: 'italic',
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeLabel: {
    fontSize: FONT_SIZES.TINY,
  },
  emptyText: {
    fontSize: FONT_SIZES.SMALL,
    paddingVertical: SPACING.SMALL,
  },
});
