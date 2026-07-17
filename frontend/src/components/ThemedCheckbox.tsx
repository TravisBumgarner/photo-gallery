import { MaterialIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../styles/useTheme';

const SIZE = 20;

interface ThemedCheckboxProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}

/**
 * Theme-aware replacement for RN's native Switch in settings lists: a square
 * checkbox that takes its radius, border, and accent from the active theme,
 * with an animated check fill.
 */
export default function ThemedCheckbox({
  value,
  onValueChange,
  accessibilityLabel,
}: ThemedCheckboxProps) {
  const theme = useTheme();
  const palette = theme.colors;
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: theme.motion.fast,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, progress, theme.motion.fast]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.5 + progress.value * 0.5 }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.box,
        {
          borderRadius: Math.min(theme.radius.control, 6),
          borderWidth: Math.max(theme.hairline, 1),
          borderColor: value ? palette.primary : palette.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: palette.primary },
          fillStyle,
        ]}
      >
        <MaterialIcons name="check" size={14} color={palette.primaryContrast} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
