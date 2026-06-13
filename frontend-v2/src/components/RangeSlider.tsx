import { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface Props {
  values: number[];
  low?: number;
  high?: number;
  onChange: (low: number | undefined, high: number | undefined) => void;
  formatValue?: (v: number) => string;
}

const THUMB_SIZE = 18;
const TRACK_HEIGHT = 4;

function findNearestIdx(values: number[], target: number, fallback: number) {
  let best = fallback;
  let bestDist = Infinity;
  for (let i = 0; i < values.length; i++) {
    const d = Math.abs(values[i] - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export default function RangeSlider({
  values,
  low,
  high,
  onChange,
  formatValue = String,
}: Props) {
  const palette = usePalette();
  const [containerWidth, setContainerWidth] = useState(0);

  if (values.length < 2) {
    return (
      <Text
        style={{ color: palette.textSecondary, fontSize: FONT_SIZES.SMALL }}
      >
        Not enough data
      </Text>
    );
  }

  const minIdx = 0;
  const maxIdx = values.length - 1;
  const lowIdx = low != null ? findNearestIdx(values, low, minIdx) : minIdx;
  const highIdx = high != null ? findNearestIdx(values, high, maxIdx) : maxIdx;

  // Snapshot of latest state for PanResponder closures (which are created once).
  const stateRef = useRef({
    containerWidth,
    lowIdx,
    highIdx,
    values,
    minIdx,
    maxIdx,
    onChange,
  });
  stateRef.current = {
    containerWidth,
    lowIdx,
    highIdx,
    values,
    minIdx,
    maxIdx,
    onChange,
  };

  const grantLowRef = useRef(lowIdx);
  const grantHighRef = useRef(highIdx);

  const emit = (newLowIdx: number, newHighIdx: number) => {
    const s = stateRef.current;
    const newLow = newLowIdx === s.minIdx ? undefined : s.values[newLowIdx];
    const newHigh = newHighIdx === s.maxIdx ? undefined : s.values[newHighIdx];
    s.onChange(newLow, newHigh);
  };

  const usable = (w: number) => Math.max(0, w - THUMB_SIZE);

  const lowResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grantLowRef.current = stateRef.current.lowIdx;
      },
      onPanResponderMove: (_, g) => {
        const s = stateRef.current;
        const u = usable(s.containerWidth);
        if (u <= 0) return;
        const delta = Math.round((g.dx / u) * (s.maxIdx - s.minIdx));
        const newLow = Math.max(
          s.minIdx,
          Math.min(s.highIdx, grantLowRef.current + delta),
        );
        emit(newLow, s.highIdx);
      },
    }),
  ).current;

  const highResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grantHighRef.current = stateRef.current.highIdx;
      },
      onPanResponderMove: (_, g) => {
        const s = stateRef.current;
        const u = usable(s.containerWidth);
        if (u <= 0) return;
        const delta = Math.round((g.dx / u) * (s.maxIdx - s.minIdx));
        const newHigh = Math.max(
          s.lowIdx,
          Math.min(s.maxIdx, grantHighRef.current + delta),
        );
        emit(s.lowIdx, newHigh);
      },
    }),
  ).current;

  const u = usable(containerWidth);
  const span = maxIdx - minIdx || 1;
  const lowX = (lowIdx / span) * u;
  const highX = (highIdx / span) * u;

  const onLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View>
      <View style={styles.container} onLayout={onLayout}>
        <View
          style={[
            styles.track,
            {
              backgroundColor: palette.divider,
              left: THUMB_SIZE / 2,
              right: THUMB_SIZE / 2,
            },
          ]}
        />
        <View
          style={[
            styles.fill,
            {
              backgroundColor: palette.primary,
              left: THUMB_SIZE / 2 + lowX,
              width: Math.max(0, highX - lowX),
            },
          ]}
        />
        <View
          {...lowResponder.panHandlers}
          style={[
            styles.thumb,
            {
              backgroundColor: palette.primary,
              borderColor: palette.background,
              left: lowX,
            },
          ]}
        />
        <View
          {...highResponder.panHandlers}
          style={[
            styles.thumb,
            {
              backgroundColor: palette.primary,
              borderColor: palette.background,
              left: highX,
            },
          ]}
        />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: palette.textPrimary }]}>
          {formatValue(values[lowIdx])}
        </Text>
        <Text style={[styles.label, { color: palette.textPrimary }]}>
          {formatValue(values[highIdx])}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    top: '50%',
    marginTop: -TRACK_HEIGHT / 2,
    height: TRACK_HEIGHT,
    borderRadius: 2,
  },
  fill: {
    position: 'absolute',
    top: '50%',
    marginTop: -TRACK_HEIGHT / 2,
    height: TRACK_HEIGHT,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -THUMB_SIZE / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.TINY,
  },
  label: {
    fontSize: FONT_SIZES.SMALL,
  },
});
