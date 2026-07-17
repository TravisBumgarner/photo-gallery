import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth';
import { type BottomBarItem, useBottomBarItems } from '../lib/bottomBar';
import { useServerUrl } from '../lib/serverUrl';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

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
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, logout } = useAuth();
  const serverUrl = useServerUrl();
  const items = useBottomBarItems();
  const [menuOpen, setMenuOpen] = useState(false);

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
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Close menu"
        />
      ) : null}

      <View
        style={[styles.wrap, { paddingBottom: insets.bottom + SPACING.SMALL }]}
        pointerEvents="box-none"
      >
        <View style={[styles.bar, { backgroundColor: palette.surface }]}>
          {/* Left: screen-specific actions. */}
          <View style={styles.leftGroup}>
            {items.map((item) => (
              <BarButton key={item.key} item={item} palette={palette} />
            ))}
          </View>

          {/* Right: the global menu, anchored so it never moves. */}
          <View>
            {menuOpen ? (
              <View
                style={[
                  styles.popover,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.divider,
                  },
                ]}
              >
                <View
                  style={[
                    styles.serverHeader,
                    { borderBottomColor: palette.divider },
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
              </View>
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
  palette: ReturnType<typeof usePalette>;
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
    borderRadius: 999,
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
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
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: SPACING.TINY,
    overflow: 'hidden',
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)',
    elevation: 8,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
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
