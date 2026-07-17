import { MaterialIcons } from '@expo/vector-icons';
import { type ReactNode, useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';
import { Tooltip } from './Tooltip';

const DESKTOP_WIDTH = 350;
/**
 * Below this the panel is a full-screen modal rather than an inline sidebar —
 * a difference callers need, since the modal hides the grid entirely.
 */
export const MOBILE_BREAKPOINT = 600;

interface SlidePanelProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional element rendered in the header, before the close button. */
  headerAction?: ReactNode;
  /** Desktop panel width in px. Defaults to 350. */
  desktopWidth?: number;
}

/**
 * Standardized container shared by every toolbar overlay (Search, Filters,
 * Sort, Folders, Display). On large screens it slides in from the left as an
 * inline column that pushes content aside; on mobile it is a full-screen modal.
 * The theme decides whether the column sits flush (hairline divider) or floats
 * as a detached card (margin + radius + shadow).
 */
export default function SlidePanel({
  visible,
  onClose,
  title,
  children,
  headerAction,
  desktopWidth = DESKTOP_WIDTH,
}: SlidePanelProps) {
  const theme = useTheme();
  const palette = theme.colors;
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;
  // Captured here (inside the app's SafeAreaProvider) rather than via a
  // <SafeAreaView> inside the <Modal> below — react-native-safe-area-context
  // reports zero insets inside a RN Modal (separate native hierarchy), which is
  // why the header used to sit under the status bar/notch. These numbers are
  // valid in this scope, so we apply them as padding inside the modal instead.
  const insets = useSafeAreaInsets();

  const floating = theme.floatingPanels;
  // A floating panel carries its own margin, so the animated outer width must
  // include it for the panel to fully clear the viewport when closed.
  const outerWidth = desktopWidth + (floating ? SPACING.SMALL * 2 : 0);

  // Desktop inline slide progress: drives both width and content fade.
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (isMobile) return;
    progress.value = withTiming(visible ? 1 : 0, {
      duration: theme.motion.base,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [isMobile, visible, progress, theme.motion.base]);

  const outerStyle = useAnimatedStyle(() => ({
    width: progress.value * outerWidth,
  }));
  const innerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const body = (
    <>
      <View
        style={[
          styles.header,
          {
            backgroundColor: floating ? 'transparent' : palette.surface,
            borderBottomWidth: theme.hairline,
            borderBottomColor: palette.divider,
          },
        ]}
      >
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {title}
        </Text>
        {headerAction}
        <Tooltip title={`Close ${title}`}>
          <Pressable
            onPress={onClose}
            accessibilityLabel={`Close ${title}`}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <MaterialIcons name="close" size={20} color={palette.textPrimary} />
          </Pressable>
        </Tooltip>
      </View>
      {children}
    </>
  );

  // Mobile: a plain full-screen modal — no left slide.
  if (isMobile) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: palette.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          {body}
        </View>
      </Modal>
    );
  }

  // Desktop: inline column that slides out from the left.
  return (
    <Animated.View
      style={[
        outerStyle,
        { overflow: 'hidden' },
        !floating && {
          backgroundColor: palette.background,
          borderRightWidth: theme.hairline,
          borderRightColor: palette.divider,
        },
      ]}
    >
      <Animated.View
        style={[
          innerStyle,
          { width: desktopWidth, flex: 1 },
          floating && {
            margin: SPACING.SMALL,
            borderRadius: theme.radius.panel,
            backgroundColor: palette.surface,
            boxShadow: theme.surfaces.dialog.boxShadow,
            overflow: 'hidden',
          },
        ]}
      >
        {body}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    gap: SPACING.MEDIUM,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
