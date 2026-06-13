import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface Props {
  startDate: string | undefined;
  endDate: string | undefined;
  onChange: (start: string | undefined, end: string | undefined) => void;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parse(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
}: Props) {
  const palette = usePalette();
  const start = parse(startDate);
  const end = parse(endDate);

  const [viewMonth, setViewMonth] = useState(() => {
    const ref = start ?? end ?? new Date();
    return new Date(ref.getFullYear(), ref.getMonth(), 1);
  });

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  while (grid.length % 7 !== 0) grid.push(null);

  const prev = () => setViewMonth(new Date(year, month - 1, 1));
  const next = () => setViewMonth(new Date(year, month + 1, 1));

  const handleDayPress = (day: Date) => {
    if (!start || (start && end) || day < start) {
      onChange(fmt(day), undefined);
    } else {
      onChange(fmt(start), fmt(day));
    }
  };

  const isStartDay = (d: Date) => start && sameDay(d, start);
  const isEndDay = (d: Date) => end && sameDay(d, end);
  const isInRange = (d: Date) => {
    if (!start) return false;
    if (!end) return false;
    return d >= start && d <= end;
  };

  return (
    <View style={{ gap: SPACING.TINY }}>
      <View style={styles.header}>
        <Pressable
          onPress={prev}
          accessibilityLabel="Previous month"
          style={({ pressed }) => [
            styles.navButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <MaterialIcons
            name="chevron-left"
            size={18}
            color={palette.textPrimary}
          />
        </Pressable>
        <Text style={[styles.headerText, { color: palette.textPrimary }]}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable
          onPress={next}
          accessibilityLabel="Next month"
          style={({ pressed }) => [
            styles.navButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <MaterialIcons
            name="chevron-right"
            size={18}
            color={palette.textPrimary}
          />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={`${w}-${i}`}
            style={[styles.weekText, { color: palette.textSecondary }]}
          >
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((day, i) => {
          if (!day) {
            return <View key={`e-${i}`} style={styles.dayCell} />;
          }
          const isStart = isStartDay(day);
          const isEnd = isEndDay(day);
          const isEdge = isStart || isEnd;
          const inRange = isInRange(day);
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => handleDayPress(day)}
              style={[
                styles.dayCell,
                inRange && !isEdge
                  ? { backgroundColor: palette.surfaceElevated }
                  : null,
                isEdge ? { backgroundColor: palette.primary } : null,
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  {
                    color: isEdge
                      ? palette.primaryContrast
                      : palette.textPrimary,
                    fontWeight: isEdge ? '700' : 'normal',
                  },
                ]}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summary}>
        <Text style={[styles.summaryText, { color: palette.textSecondary }]}>
          {startDate ?? '—'} → {endDate ?? '—'}
        </Text>
        {(start || end) && (
          <Pressable
            onPress={() => onChange(undefined, undefined)}
            accessibilityLabel="Clear date range"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.clearText, { color: palette.primary }]}>
              Clear
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekText: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: FONT_SIZES.SMALL,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.TINY,
  },
  summaryText: {
    fontSize: FONT_SIZES.SMALL,
  },
  clearText: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
  },
});
