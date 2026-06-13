import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface ToolbarProps {
  searchActive: boolean;
  folderActive: boolean;
  onToggleSearch: () => void;
  onToggleFilters: () => void;
  onToggleSort: () => void;
  onToggleFolders: () => void;
  onToggleSettings: () => void;
}

export default function Toolbar({
  searchActive,
  folderActive,
  onToggleSearch,
  onToggleFilters,
  onToggleSort,
  onToggleFolders,
  onToggleSettings,
}: ToolbarProps) {
  const palette = usePalette();

  return (
    <View style={[styles.root, { backgroundColor: palette.surface }]}>
      <IconButton
        icon="search"
        onPress={onToggleSearch}
        palette={palette}
        title="Search"
        active={searchActive}
      />

      <IconButton
        icon="filter-list-alt"
        onPress={onToggleFilters}
        palette={palette}
        title="Filters"
      />

      <IconButton
        icon="swap-vert"
        onPress={onToggleSort}
        palette={palette}
        title="Sort"
      />

      <IconButton
        icon="folder"
        onPress={onToggleFolders}
        palette={palette}
        title="Folders"
        active={folderActive}
      />

      <IconButton
        icon="settings"
        onPress={onToggleSettings}
        palette={palette}
        title="Settings"
      />
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  disabled,
  palette,
  title,
  active = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  disabled?: boolean;
  palette: ReturnType<typeof usePalette>;
  title: string;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={20}
        color={active ? palette.primary : palette.textPrimary}
      />
      <Text style={[styles.caption, { color: palette.textSecondary }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderRadius: 999,
    boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
    elevation: 10,
    zIndex: 10,
  },
  iconButton: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: SPACING.TINY,
  },
  caption: {
    fontSize: FONT_SIZES.TINY,
  },
});
