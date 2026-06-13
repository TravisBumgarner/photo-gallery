import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface SortModalProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onChange: (changed: Partial<PhotoFilters>) => void;
}

const SORT_OPTIONS = [
  { value: 'dateCaptured', label: 'Date taken' },
  { value: 'createdAt', label: 'Date added' },
  { value: 'filename', label: 'Filename' },
  { value: 'iso', label: 'ISO' },
  { value: 'aperture', label: 'Aperture' },
  { value: 'camera', label: 'Camera' },
];

export default function SortModal({
  sortBy,
  sortOrder,
  onChange,
}: SortModalProps) {
  const palette = usePalette();

  return (
    <>
      <View style={styles.section}>
        {SORT_OPTIONS.map((option) => {
          const selected = sortBy === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange({ sortBy: option.value })}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected
                    ? palette.surfaceElevated
                    : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.rowLabel,
                  {
                    color: selected ? palette.primary : palette.textPrimary,
                    fontWeight: selected ? '600' : 'normal',
                  },
                ]}
              >
                {option.label}
              </Text>
              {selected ? (
                <MaterialIcons name="check" size={16} color={palette.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View
        style={[styles.directionRow, { borderTopColor: palette.divider }]}
      >
        <DirectionButton
          label="Descending"
          icon="arrow-downward"
          active={sortOrder === 'desc'}
          onPress={() => onChange({ sortOrder: 'desc' })}
          palette={palette}
        />
        <DirectionButton
          label="Ascending"
          icon="arrow-upward"
          active={sortOrder === 'asc'}
          onPress={() => onChange({ sortOrder: 'asc' })}
          palette={palette}
        />
      </View>
    </>
  );
}

function DirectionButton({
  label,
  icon,
  active,
  onPress,
  palette,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  active: boolean;
  onPress: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.directionButton,
        {
          backgroundColor: active ? palette.primary : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={14}
        color={active ? palette.primaryContrast : palette.textPrimary}
      />
      <Text
        style={[
          styles.directionLabel,
          {
            color: active ? palette.primaryContrast : palette.textPrimary,
            fontWeight: active ? '600' : 'normal',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: SPACING.TINY,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  rowLabel: {
    flex: 1,
    fontSize: FONT_SIZES.SMALL,
  },
  directionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.TINY,
    paddingVertical: SPACING.SMALL,
  },
  directionLabel: {
    fontSize: FONT_SIZES.SMALL,
  },
});
