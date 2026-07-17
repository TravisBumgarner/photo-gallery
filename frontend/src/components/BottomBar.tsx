import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth';
import { type BottomBarItem, useBottomBarItems } from '../lib/bottomBar';
import { useServerUrl } from '../lib/serverUrl';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import type { Palette } from '../styles/usePalette';
import { useTheme } from '../styles/useTheme';
import { useMountTransition } from './AnimatedDialog';

/** Widest the bar grows on large screens; it stretches to fit below that. */
const MAX_WIDTH = 350;

interface MenuNavItem {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
}

/**
 * The single bottom bar, rendered once at the app root. Screen-specific actions
 * are left-justified; the global menu button is right-justified and lives here
 * (not per screen), so it stays in a fixed position and never flashes as you
 * navigate between Gallery and Stats. Hidden on login / when unauthenticated.
 */
export default function BottomBar() {
  const theme = useTheme();
  const palette = theme.colors;
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, logout } = useAuth();
  const serverUrl = useServerUrl();
  const items = useBottomBarItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useMountTransition(menuOpen, theme.motion.base, theme.motion.fast);

  const menuStyle = useAnimatedStyle(() => ({
    opacity: menu.progress.value,
    transform: [{ translateY: (1 - menu.progress.value) * 8 }],
  }));

  if (!isAuthenticated || pathname === '/login') return null;

  // Both "Switch server" and "Log out" end on the login screen (logout flips
  // auth → the unauthenticated Redirect). The server field there is prefilled
  // and editable, so logging out is the path to a new server; the distinct
  // label just signals intent.
  const menuItems: MenuNavItem[] = [
    {
      icon: 'photo-library',
      label: 'Gallery',
      onPress: () => router.replace('/'),
    },
    { icon: 'bar-chart', label: 'Stats', onPress: () => router.push('/stats') },
    { icon: 'dns', label: 'Switch server', onPress: logout },
    { icon: 'logout', label: 'Log out', onPress: logout },
  ];

  const serverHost = serverUrl.replace(/^https?:\/\//i, '') || 'No server';

  return (
    <>
      {menuOpen ? (
        <Pressable
          // Just below the bar's wrap (zIndex 100): catches outside clicks
          // anywhere on the page without sitting under sibling stacking
          // contexts, while the bar and menu stay tappable above it.
          style={[StyleSheet.absoluteFill, { zIndex: 99 }]}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Close menu"
        />
      ) : null}

      <View
        style={[styles.wrap, { paddingBottom: insets.bottom + SPACING.SMALL }]}
        pointerEvents="box-none"
      >
        <View style={[styles.bar, theme.surfaces.bar]}>
          {/* Left: screen-specific actions. */}
          <View style={styles.leftGroup}>
            {items.map((item) => (
              <BarButton key={item.key} item={item} palette={palette} />
            ))}
          </View>

          {/* Right: the global menu, anchored so it never moves. */}
          <View>
            {menu.mounted ? (
              <Animated.View
                style={[styles.popover, theme.surfaces.popover, menuStyle]}
              >
                <View
                  style={[
                    styles.serverHeader,
                    {
                      borderBottomWidth: Math.max(theme.hairline, 1),
                      borderBottomColor: palette.divider,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="dns"
                    size={14}
                    color={palette.textSecondary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.serverHost,
                      { color: palette.textSecondary },
                    ]}
                  >
                    {serverHost}
                  </Text>
                </View>
                {menuItems.map((item) => (
                  <Pressable
                    key={item.label}
                    onPress={() => {
                      setMenuOpen(false);
                      item.onPress();
                    }}
                    accessibilityLabel={item.label}
                    style={({ pressed }) => [
                      styles.popoverItem,
                      {
                        backgroundColor: pressed
                          ? palette.surfaceElevated
                          : 'transparent',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={20}
                      color={palette.textPrimary}
                    />
                    <Text
                      style={[
                        styles.popoverLabel,
                        { color: palette.textPrimary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            ) : null}

            <BarButton
              item={{
                key: '__menu',
                icon: menuOpen ? 'close' : 'menu',
                label: 'Menu',
                active: menuOpen,
                onPress: () => setMenuOpen((v) => !v),
              }}
              palette={palette}
            />
          </View>
        </View>
      </View>
    </>
  );
}

function BarButton({
  item,
  palette,
}: {
  item: BottomBarItem;
  palette: Palette;
}) {
  return (
    <Pressable
      onPress={item.onPress}
      accessibilityLabel={item.label}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <MaterialIcons
        name={item.icon}
        size={20}
        color={item.active ? palette.primary : palette.textPrimary}
      />
      <Text style={[styles.caption, { color: palette.textSecondary }]}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.MEDIUM,
    alignItems: 'center',
    pointerEvents: 'box-none',
    zIndex: 100,
  },
  bar: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.SMALL,
    elevation: 10,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  button: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: SPACING.TINY,
  },
  caption: {
    fontSize: FONT_SIZES.TINY,
  },
  popover: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: SPACING.SMALL,
    minWidth: 180,
    paddingVertical: SPACING.TINY,
    overflow: 'hidden',
    elevation: 8,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  serverHost: {
    fontSize: 12,
    flex: 1,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.MEDIUM,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  popoverLabel: {
    fontSize: 15,
  },
});
