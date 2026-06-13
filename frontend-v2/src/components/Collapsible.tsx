import { type ReactNode, useEffect } from 'react';
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
 * Animates its content open/closed with a measured height + fade. The content
 * stays mounted (measured off an absolutely-positioned layer) so collapsing can
 * animate; a single eased `progress` value drives both height and opacity.
 * Seeded to the current state, so there is no animation on first mount.
 */
export default function Collapsible({
  expanded,
  children,
  duration = 200,
}: CollapsibleProps) {
  const height = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration });
  }, [expanded, duration, progress]);

  const style = useAnimatedStyle(() => ({
    height: height.value * progress.value,
    opacity: progress.value,
  }));

  return (
    <Animated.View style={[styles.clip, style]}>
      <View
        style={styles.measure}
        onLayout={(e: LayoutChangeEvent) => {
          height.value = e.nativeEvent.layout.height;
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, right: 0 },
});
