import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';

/**
 * Drives enter/exit animations for conditionally-rendered chrome (menus,
 * dialogs, overlays). Keeps the element mounted until the exit animation
 * finishes; `progress` eases 0→1 on show and 1→0 on hide.
 */
export function useMountTransition(
  visible: boolean,
  durationIn = 220,
  durationOut = 140,
): { mounted: boolean; progress: SharedValue<number> } {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  // Mount synchronously with the show flag (render-phase state adjustment),
  // so the enter animation starts from the first visible frame.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, {
        duration: durationIn,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(
        0,
        { duration: durationOut, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, durationIn, durationOut, progress]);

  return { mounted, progress };
}

interface AnimatedDialogProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra style for the dialog box (size constraints etc.); the theme's
   *  dialog surface is applied beneath it. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A centered modal dialog with a fading scrim and a rise-and-fade dialog box.
 * Replaces bare RN <Modal animationType="fade"> so every dialog enters and
 * exits smoothly and carries the theme's dialog surface.
 */
export default function AnimatedDialog({
  visible,
  onClose,
  children,
  style,
}: AnimatedDialogProps) {
  const theme = useTheme();
  const { mounted, progress } = useMountTransition(
    visible,
    theme.motion.base,
    theme.motion.fast,
  );

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const dialogStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 12 },
      { scale: 0.97 + progress.value * 0.03 },
    ],
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.scrim },
          scrimStyle,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close dialog"
        />
        <Animated.View
          style={[styles.dialog, theme.surfaces.dialog, dialogStyle, style]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.MEDIUM,
  },
  dialog: {
    overflow: 'hidden',
  },
});
