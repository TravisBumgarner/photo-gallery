import { MaterialIcons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import { Tooltip } from './Tooltip';

const DESKTOP_WIDTH = 350;
const MOBILE_BREAKPOINT = 600;

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
 */
export default function SlidePanel({
  visible,
  onClose,
  title,
  children,
  headerAction,
  desktopWidth = DESKTOP_WIDTH,
}: SlidePanelProps) {
  const palette = usePalette();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;

  // Desktop inline width animation state.
  const widthAnim = useRef(
    new Animated.Value(visible ? desktopWidth : 0),
  ).current;

  useEffect(() => {
    if (isMobile) return;
    Animated.timing(widthAnim, {
      toValue: visible ? desktopWidth : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isMobile, visible, widthAnim, desktopWidth]);

  const body = (
    <>
      <View
        style={[
          styles.header,
          {
            backgroundColor: palette.surface,
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
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <SafeAreaView
          edges={['top', 'bottom']}
          style={{ flex: 1, backgroundColor: palette.background }}
        >
          {body}
        </SafeAreaView>
      </Modal>
    );
  }

  // Desktop: inline column that slides out from the left.
  return (
    <Animated.View
      style={{
        width: widthAnim,
        backgroundColor: palette.background,
        borderRightWidth: 1,
        borderRightColor: palette.divider,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: desktopWidth, flex: 1 }}>{body}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
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
