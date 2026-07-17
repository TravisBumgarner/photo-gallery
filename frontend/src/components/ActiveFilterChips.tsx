import { MaterialIcons } from '@expo/vector-icons';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

interface ActiveFilterChipsProps {
  filters: PhotoFilters;
  onClear: (changed: Partial<PhotoFilters>) => void;
}

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

export interface ChipDescriptor {
  label: string;
  icon?: IconName;
  clear: Partial<PhotoFilters>;
}

/**
 * Flattens the filter object into one dismissible chip per active constraint.
 * Exported so the empty state can offer the same per-filter escape hatches
 * without re-deriving what's active.
 */
export function describeFilters(filters: PhotoFilters): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];

  if (filters.search) {
    chips.push({
      label: filters.search,
      icon: 'search',
      clear: { search: undefined },
    });
  }
  if (filters.contentSearch) {
    chips.push({
      label: filters.contentSearch,
      icon: 'auto-awesome',
      clear: { contentSearch: undefined },
    });
  }
  if (filters.folder) {
    chips.push({
      label: shortenFolder(filters.folder),
      icon: 'folder',
      clear: { folder: undefined },
    });
  }
  if (filters.label) {
    chips.push({ label: filters.label, clear: { label: undefined } });
  }
  if (filters.rating !== undefined) {
    chips.push({
      label: `${filters.rating}`,
      icon: 'star',
      clear: { rating: undefined },
    });
  }
  if (filters.camera) {
    filters.camera
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          icon: 'camera-alt',
          clear: {
            camera: removeFromList(filters.camera, value),
          },
        });
      });
  }
  if (filters.lens) {
    filters.lens
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          clear: {
            lens: removeFromList(filters.lens, value),
          },
        });
      });
  }
  if (filters.people) {
    filters.people
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          icon: 'person',
          clear: {
            people: removeFromList(filters.people, value),
          },
        });
      });
  }
  if (filters.dogs) {
    filters.dogs
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          icon: 'pets',
          clear: {
            dogs: removeFromList(filters.dogs, value),
          },
        });
      });
  }
  if (filters.keyword) {
    filters.keyword
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          icon: 'label',
          clear: {
            keyword: removeFromList(filters.keyword, value),
          },
        });
      });
  }
  if (filters.aspectRatio) {
    filters.aspectRatio
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: `Ratio ${value}`,
          clear: {
            aspectRatio: removeFromList(filters.aspectRatio, value),
          },
        });
      });
  }
  if (filters.orientation) {
    filters.orientation
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          clear: {
            orientation: removeFromList(filters.orientation, value),
          },
        });
      });
  }
  if (filters.minIso != null || filters.maxIso != null) {
    const min = filters.minIso != null ? Math.round(filters.minIso) : '…';
    const max = filters.maxIso != null ? Math.round(filters.maxIso) : '…';
    chips.push({
      label: `ISO ${min}–${max}`,
      clear: { minIso: undefined, maxIso: undefined },
    });
  }
  if (filters.minAperture != null || filters.maxAperture != null) {
    const min =
      filters.minAperture != null ? formatAperture(filters.minAperture) : '…';
    const max =
      filters.maxAperture != null ? formatAperture(filters.maxAperture) : '…';
    chips.push({
      label: `f/${min}–f/${max}`,
      clear: { minAperture: undefined, maxAperture: undefined },
    });
  }
  if (filters.startDate || filters.endDate) {
    const start = filters.startDate || '…';
    const end = filters.endDate || '…';
    chips.push({
      label: `${start} → ${end}`,
      clear: { startDate: undefined, endDate: undefined },
    });
  }
  if (filters.selectedMonths) {
    filters.selectedMonths
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          clear: {
            selectedMonths: removeFromList(filters.selectedMonths, value),
          },
        });
      });
  }
  if (filters.selectedDates) {
    filters.selectedDates
      .split(',')
      .filter(Boolean)
      .forEach((value) => {
        chips.push({
          label: value,
          clear: {
            selectedDates: removeFromList(filters.selectedDates, value),
          },
        });
      });
  }

  return chips;
}

function formatAperture(value: number): string {
  // Aperture f-numbers come back as floats; show at most one decimal (f/1.8, f/8).
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortenFolder(folder: string): string {
  const parts = folder.split('/').filter(Boolean);
  if (parts.length <= 2) return parts.join('/');
  return `.../${parts.slice(-2).join('/')}`;
}

function removeFromList(
  current: string | undefined,
  value: string,
): string | undefined {
  if (!current) return undefined;
  const next = current
    .split(',')
    .filter(Boolean)
    .filter((v) => v !== value)
    .join(',');
  return next || undefined;
}

export default function ActiveFilterChips({
  filters,
  onClear,
}: ActiveFilterChipsProps) {
  const palette = usePalette();
  const chips = describeFilters(filters);

  if (chips.length === 0) return null;

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chips.map((chip, index) => (
          <FilterChip
            key={`${chip.label}-${index}`}
            chip={chip}
            onClear={onClear}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** One dismissible filter chip. Tapping it clears just that constraint. */
export function FilterChip({
  chip,
  onClear,
}: {
  chip: ChipDescriptor;
  onClear: (changed: Partial<PhotoFilters>) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={() => onClear(chip.clear)}
      accessibilityLabel={`Clear filter ${chip.label}`}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: palette.surfaceElevated,
          borderColor: palette.divider,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {chip.icon && (
        <MaterialIcons
          name={chip.icon}
          size={12}
          color={palette.textSecondary}
        />
      )}
      <Text
        numberOfLines={1}
        style={[styles.chipText, { color: palette.textPrimary }]}
      >
        {chip.label}
      </Text>
      <MaterialIcons name="close" size={12} color={palette.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: SPACING.TINY,
    paddingVertical: SPACING.TINY,
    paddingHorizontal: SPACING.SMALL,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FONT_SIZES.SMALL,
    flexShrink: 0,
  },
});
