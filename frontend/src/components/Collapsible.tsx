import { type ReactNode, useEffect, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface CollapsibleProps {
  expanded: boolean;
  children: ReactNode;
  /** Animation duration in ms. */
  duration?: number;
}

/**
 * Animates its content open/closed with a measured height + fade. A single
 * eased `progress` value drives both height and opacity. Seeded to the
 * current state, so there is no animation on first mount.
 *
 * Content is NOT rendered until the first expand — sections that were never
 * opened cost nothing (the filter sidebar's calendar alone is thousands of
 * elements when mounted collapsed). After the first expand it stays mounted
 * (off an absolutely-positioned measuring layer) so collapsing can animate
 * and re-opening is instant.
 */
export default function Collapsible({
  expanded,
  children,
  duration = 200,
}: CollapsibleProps) {
  const height = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  const [hasExpanded, setHasExpanded] = useState(expanded);
  // Render-phase state adjustment: mount content in the same commit as the
  // expand, so the measure layer exists before the height animation runs.
  if (expanded && !hasExpanded) setHasExpanded(true);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration });
  }, [expanded, duration, progress]);

  const style = useAnimatedStyle(() => ({
    height: height.value * progress.value,
    opacity: progress.value,
  }));

  return (
    <Animated.View style={[styles.clip, style]}>
      {hasExpanded ? (
        <View
          style={styles.measure}
          onLayout={(e: LayoutChangeEvent) => {
            height.value = e.nativeEvent.layout.height;
          }}
        >
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, right: 0 },
});
