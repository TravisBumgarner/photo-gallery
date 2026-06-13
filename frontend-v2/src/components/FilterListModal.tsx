import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

export interface FilterListOption {
  label: string;
  count?: number;
}

type SortMode = 'popularity' | 'abc';

interface FilterListModalProps {
  visible: boolean;
  title: string;
  options: FilterListOption[];
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}

export default function FilterListModal({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: FilterListModalProps) {
  const palette = usePalette();
  const [sortMode, setSortMode] = useState<SortMode>('popularity');

  // Reset to popularity each time the modal opens so the most-used items lead.
  useEffect(() => {
    if (visible) setSortMode('popularity');
  }, [visible]);

  const selected = useMemo(
    () => new Set(value ? value.split(',').filter(Boolean) : []),
    [value],
  );

  const sortedOptions = useMemo(() => {
    const copy = [...options];
    if (sortMode === 'popularity') {
      copy.sort((a, b) => {
        const ca = a.count ?? 0;
        const cb = b.count ?? 0;
        if (cb !== ca) return cb - ca;
        return a.label.localeCompare(b.label);
      });
    } else {
      copy.sort((a, b) => a.label.localeCompare(b.label));
    }
    return copy;
  }, [options, sortMode]);

  const toggle = (label: string) => {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(Array.from(next).join(','));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.dialog,
            { backgroundColor: palette.surface, borderColor: palette.divider },
          ]}
        >
          <View
            style={[styles.header, { borderBottomColor: palette.divider }]}
          >
            <Text style={[styles.title, { color: palette.textPrimary }]}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <MaterialIcons
                name="close"
                size={20}
                color={palette.textPrimary}
              />
            </Pressable>
          </View>

          <View
            style={[styles.toolbar, { borderBottomColor: palette.divider }]}
          >
            <Text
              style={[styles.toolbarLabel, { color: palette.textSecondary }]}
            >
              Sort
            </Text>
            <SortToggle
              label="Popularity"
              active={sortMode === 'popularity'}
              onPress={() => setSortMode('popularity')}
              palette={palette}
            />
            <SortToggle
              label="A–Z"
              active={sortMode === 'abc'}
              onPress={() => setSortMode('abc')}
              palette={palette}
            />
            {selected.size > 0 ? (
              <Pressable
                onPress={() => onChange('')}
                style={({ pressed }) => [
                  styles.clearButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.clearText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Clear ({selected.size})
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView style={{ flex: 1 }}>
            {sortedOptions.map((opt) => {
              const isActive = selected.has(opt.label);
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => toggle(opt.label)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: isActive
                        ? palette.primary
                        : pressed
                          ? palette.surfaceElevated
                          : 'transparent',
                      borderBottomColor: palette.divider,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={
                      isActive ? 'check-box' : 'check-box-outline-blank'
                    }
                    size={16}
                    color={
                      isActive ? palette.primaryContrast : palette.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      {
                        color: isActive
                          ? palette.primaryContrast
                          : palette.textPrimary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {opt.count != null ? (
                    <Text
                      style={[
                        styles.rowCount,
                        {
                          color: isActive
                            ? palette.primaryContrast
                            : palette.textSecondary,
                        },
                      ]}
                    >
                      {opt.count}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
            {sortedOptions.length === 0 ? (
              <Text style={[styles.empty, { color: palette.textSecondary }]}>
                No options available.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SortToggle({
  label,
  active,
  onPress,
  palette,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sortChip,
        {
          backgroundColor: active ? palette.primary : 'transparent',
          borderColor: active ? palette.primary : palette.divider,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.sortChipText,
          { color: active ? palette.primaryContrast : palette.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.MEDIUM,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    borderWidth: 1,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
    gap: SPACING.SMALL,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
    gap: SPACING.SMALL,
    flexWrap: 'wrap',
  },
  toolbarLabel: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sortChip: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: FONT_SIZES.SMALL,
  },
  clearButton: {
    marginLeft: 'auto',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
  },
  clearText: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    flex: 1,
    fontSize: FONT_SIZES.SMALL,
  },
  rowCount: {
    fontSize: FONT_SIZES.TINY,
  },
  empty: {
    fontSize: FONT_SIZES.SMALL,
    padding: SPACING.SMALL,
  },
});
