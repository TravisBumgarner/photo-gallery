import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';

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
  const theme = useTheme();
  const palette = theme.colors;

  return (
    <>
      <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
        SORT BY
      </Text>
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
                  borderRadius: theme.radius.control,
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

      <View style={[styles.footer, { borderTopColor: palette.divider }]}>
        <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
          DIRECTION
        </Text>
        <View style={styles.directionRow}>
          <DirectionButton
          label="Descending"
          icon="arrow-downward"
          active={sortOrder === 'desc'}
          onPress={() => onChange({ sortOrder: 'desc' })}
          theme={theme}
        />
        <DirectionButton
            label="Ascending"
            icon="arrow-upward"
            active={sortOrder === 'asc'}
            onPress={() => onChange({ sortOrder: 'asc' })}
            theme={theme}
          />
        </View>
      </View>
    </>
  );
}

function DirectionButton({
  label,
  icon,
  active,
  onPress,
  theme,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const palette = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.directionButton,
        {
          borderRadius: theme.radius.control,
          backgroundColor: active ? palette.primary : palette.surfaceElevated,
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
  eyebrow: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.MEDIUM,
    paddingTop: SPACING.SMALL,
  },
  section: {
    paddingVertical: SPACING.TINY,
    paddingBottom: SPACING.SMALL,
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
  footer: {
    borderTopWidth: 1,
    paddingBottom: SPACING.MEDIUM,
  },
  directionRow: {
    flexDirection: 'row',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingTop: SPACING.SMALL,
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
