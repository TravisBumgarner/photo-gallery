import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth';
import { SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface NavItem {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
}

/**
 * Global bottom-right menu FAB. Rendered once at the app root so every screen
 * shares the same navigation affordance. Hidden on the login screen and while
 * unauthenticated.
 */
export default function AppMenu() {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated || pathname === '/login') return null;

  const navItems: NavItem[] = [
    {
      icon: 'photo-library',
      label: 'Gallery',
      onPress: () => router.replace('/'),
    },
    {
      icon: 'bar-chart',
      label: 'Stats',
      onPress: () => router.push('/stats'),
    },
    {
      icon: 'logout',
      label: 'Log out',
      onPress: logout,
    },
  ];

  return (
    <>
      {open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close menu"
        />
      ) : null}

      <View
        style={[styles.wrap, { paddingBottom: insets.bottom + SPACING.SMALL }]}
        pointerEvents="box-none"
      >
        {open ? (
          <View
            style={[
              styles.popover,
              {
                backgroundColor: palette.surface,
                borderColor: palette.divider,
              },
            ]}
          >
            {navItems.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
                accessibilityLabel={item.label}
                style={({ pressed }) => [
                  styles.item,
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
                <Text style={[styles.itemLabel, { color: palette.textPrimary }]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityLabel="Menu"
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialIcons
            name={open ? 'close' : 'menu'}
            size={26}
            color={palette.primaryContrast}
          />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.MEDIUM,
    alignItems: 'flex-end',
    gap: SPACING.SMALL,
    pointerEvents: 'box-none',
    zIndex: 101,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.25)',
    elevation: 10,
  },
  popover: {
    minWidth: 180,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: SPACING.TINY,
    overflow: 'hidden',
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)',
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.MEDIUM,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  itemLabel: {
    fontSize: 15,
  },
});
