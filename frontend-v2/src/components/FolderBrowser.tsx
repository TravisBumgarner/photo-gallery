import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import { Tooltip } from './Tooltip';

interface FolderBrowserProps {
  folder: string;
  onFolderChange: (folder: string) => void;
}

export default function FolderBrowser({
  folder,
  onFolderChange,
}: FolderBrowserProps) {
  const palette = usePalette();
  if (!folder) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.divider,
        },
      ]}
    >
      <MaterialIcons name="folder" size={14} color={palette.textSecondary} />
      <Tooltip title={folder} style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.path, { color: palette.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="head"
        >
          {folder}
        </Text>
      </Tooltip>
      <Tooltip title="Clear folder">
        <Pressable
          onPress={() => onFolderChange('')}
          accessibilityLabel="Clear folder"
          style={({ pressed }) => [
            styles.clear,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <MaterialIcons
            name="close"
            size={14}
            color={palette.textSecondary}
          />
        </Pressable>
      </Tooltip>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderBottomWidth: 1,
    gap: SPACING.SMALL,
  },
  path: {
    width: '100%',
    fontSize: FONT_SIZES.SMALL,
  },
  clear: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
