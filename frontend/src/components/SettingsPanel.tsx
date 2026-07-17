import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Sortable from 'react-native-sortables';

import ThemedCheckbox from './ThemedCheckbox';

import {
  FILTER_SECTIONS,
  type FilterSectionKey,
  getAutoColumnCount,
  MAX_COLUMNS,
  MIN_COLUMNS,
  setColumnCount,
  setFilterSectionMode,
  setFilterSectionOrder,
  setSectionVisible,
  setThemeKey,
  useSettings,
} from '../lib/settings';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import {
  buildTheme,
  THEME_KEYS,
  type Theme,
  type ThemeKey,
} from '../styles/theme';
import type { Palette } from '../styles/usePalette';
import { useTheme } from '../styles/useTheme';

const SECTION_LABELS: Record<FilterSectionKey, string> = Object.fromEntries(
  FILTER_SECTIONS.map((s) => [s.key, s.label]),
) as Record<FilterSectionKey, string>;

// react-native-web honours the `grab`/`grabbing` cursor; RN's `CursorValue`
// type only allows auto/pointer, so cast past it for the web-only hint.
const GRAB_CURSOR = { cursor: 'grab' } as unknown as ViewStyle;

type SettingsTab = 'general' | 'themes';

export default function SettingsPanel() {
  const theme = useTheme();
  const palette = theme.colors;
  const settings = useSettings();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<SettingsTab>('general');

  const order = settings.filterSectionOrder;
  const autoColumns = getAutoColumnCount(width);
  const isAutoColumns = settings.columnCount == null;
  const effectiveColumns = settings.columnCount ?? autoColumns;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabRow}>
        {(
          [
            { key: 'general' as const, label: 'General' },
            { key: 'themes' as const, label: 'Themes' },
          ]
        ).map(({ key, label }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.tabButton,
                theme.surfaces.chip,
                {
                  backgroundColor: active ? palette.primary : 'transparent',
                  ...(theme.hairline > 0 && {
                    borderColor: active ? palette.primary : palette.divider,
                  }),
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: active
                      ? palette.primaryContrast
                      : palette.textPrimary,
                    fontWeight: active ? '700' : '500',
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'themes' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: SPACING.MEDIUM,
            gap: SPACING.MEDIUM,
          }}
        >
          <View style={{ gap: SPACING.SMALL }}>
            <Text
              style={[styles.sectionHelp, { color: palette.textSecondary }]}
            >
              Restyles the whole app. Light or dark still follows your system.
            </Text>
            <View style={{ gap: SPACING.SMALL }}>
              {THEME_KEYS.map((key) => (
                <ThemeCard
                  key={key}
                  themeKey={key}
                  scheme={theme.scheme}
                  selected={settings.themeKey === key}
                  accent={palette.primary}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: SPACING.MEDIUM, gap: SPACING.MEDIUM }}
    >
      <View style={{ gap: SPACING.SMALL }}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          GALLERY DISPLAY
        </Text>
        <Text style={[styles.sectionHelp, { color: palette.textSecondary }]}>
          Number of columns in the photo grid.
        </Text>
        <View
          style={[styles.list, theme.surfaces.card]}>
          <View style={styles.displayRow}>
            <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>
              Columns
            </Text>
            <Pressable
              onPress={() => setColumnCount(null)}
              disabled={isAutoColumns}
              accessibilityLabel="Reset columns to automatic"
              style={({ pressed }) => [
                styles.autoButton,
                {
                  borderRadius: theme.radius.chip,
                  borderColor: isAutoColumns
                    ? palette.primary
                    : palette.divider,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.autoText,
                  {
                    color: isAutoColumns
                      ? palette.primary
                      : palette.textSecondary,
                  },
                ]}
              >
                Auto
              </Text>
            </Pressable>
            <View
              style={[
                styles.stepper,
                {
                  borderRadius: theme.radius.chip,
                  borderColor: palette.divider,
                },
              ]}
            >
              <StepperButton
                icon="remove"
                onPress={() => setColumnCount(effectiveColumns - 1)}
                disabled={effectiveColumns <= MIN_COLUMNS}
                palette={palette}
                label="Fewer columns"
              />
              <Text
                style={[styles.stepperCount, { color: palette.textPrimary }]}
              >
                {effectiveColumns}
              </Text>
              <StepperButton
                icon="add"
                onPress={() => setColumnCount(effectiveColumns + 1)}
                disabled={effectiveColumns >= MAX_COLUMNS}
                palette={palette}
                label="More columns"
              />
            </View>
          </View>
        </View>
      </View>

      <View style={{ gap: SPACING.SMALL }}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          FILTER SIDEBAR BEHAVIOR
        </Text>
        <Text style={[styles.sectionHelp, { color: palette.textSecondary }]}>
          Choose how many filter sections can be expanded at once.
        </Text>
        <View
          style={[styles.list, theme.surfaces.card]}>
          {(
            [
              {
                value: 'multiple' as const,
                label: 'Multiple open',
                description: 'Keep any sections you toggle open expanded.',
              },
              {
                value: 'single' as const,
                label: 'One at a time',
                description:
                  'Opening a section automatically collapses the others.',
              },
            ]
          ).map((opt, idx, arr) => {
            const active = settings.filterSectionMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setFilterSectionMode(opt.value)}
                style={({ pressed }) => [
                  styles.modeRow,
                  idx < arr.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: palette.textPrimary, fontWeight: '600' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeDescription,
                      { color: palette.textSecondary },
                    ]}
                  >
                    {opt.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: active ? palette.primary : palette.divider,
                    },
                  ]}
                >
                  {active ? (
                    <View
                      style={[
                        styles.radioDot,
                        { backgroundColor: palette.primary },
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: SPACING.SMALL }}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          FILTER SIDEBAR SECTIONS
        </Text>
        <Text style={[styles.sectionHelp, { color: palette.textSecondary }]}>
          Toggle which filter sections appear in the sidebar, and drag the
          handle to reorder them.
        </Text>
        {/* Card frame around the whole reorder list, matching the other
            settings groups. Dragged rows render within the grid, so the
            card's overflow clip only matters at the very edges mid-drag. */}
        <View style={[styles.list, theme.surfaces.card]}>
          <Sortable.Grid
          columns={1}
          data={order}
          keyExtractor={(key) => key}
          rowGap={0}
          customHandle
          dragActivationDelay={0}
          onDragEnd={({ data }) => setFilterSectionOrder(data)}
          renderItem={({ item: key }) => (
            <View
              style={[
                styles.sortRow,
                {
                  backgroundColor: palette.surface,
                  borderBottomColor: palette.divider,
                },
              ]}
            >
              <Sortable.Handle style={[styles.dragHandle, GRAB_CURSOR]}>
                <View pointerEvents="none">
                  <MaterialIcons
                    name="drag-indicator"
                    size={18}
                    color={palette.textSecondary}
                  />
                </View>
              </Sortable.Handle>
              <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>
                {SECTION_LABELS[key]}
              </Text>
              <ThemedCheckbox
                value={settings.visibleFilterSections[key]}
                onValueChange={(next) => setSectionVisible(key, next)}
                accessibilityLabel={`Show ${SECTION_LABELS[key]} section`}
              />
            </View>
          )}
          />
        </View>
      </View>
    </ScrollView>
      )}
    </View>
  );
}

/**
 * One selectable theme option, drawn *in* the theme it represents — its own
 * background, shapes, and accent — so the picker doubles as a live preview.
 */
function ThemeCard({
  themeKey,
  scheme,
  selected,
  accent,
}: {
  themeKey: ThemeKey;
  scheme: Theme['scheme'];
  selected: boolean;
  accent: string;
}) {
  const preview = buildTheme(themeKey, scheme);
  const c = preview.colors;
  return (
    <Pressable
      onPress={() => setThemeKey(themeKey)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Use ${preview.name} theme`}
      style={({ pressed }) => [
        styles.themeCard,
        {
          backgroundColor: c.background,
          borderRadius: Math.min(preview.radius.panel, 16),
          borderColor: selected ? accent : c.divider,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {/* Miniature chrome: a chip, a card, and an accent pill in the
          candidate theme's shapes. */}
      <View style={styles.themeSwatchRow}>
        <View
          style={[
            styles.themeSwatchChip,
            preview.surfaces.chip,
            { backgroundColor: c.primary },
          ]}
        />
        <View style={[styles.themeSwatchCard, preview.surfaces.card]} />
        <View
          style={[
            styles.themeSwatchCard,
            preview.surfaces.card,
            { backgroundColor: c.surfaceElevated },
          ]}
        />
      </View>
      <View style={styles.themeNameRow}>
        <Text style={[styles.themeName, { color: c.textPrimary }]}>
          {preview.name}
        </Text>
        {selected ? (
          <MaterialIcons name="check-circle" size={18} color={accent} />
        ) : null}
      </View>
      <Text style={[styles.themeTagline, { color: c.textSecondary }]}>
        {preview.tagline}
      </Text>
    </Pressable>
  );
}

function StepperButton({
  icon,
  onPress,
  disabled,
  palette,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  disabled: boolean;
  palette: Palette;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepperButton,
        { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 },
      ]}
    >
      <MaterialIcons name={icon} size={16} color={palette.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionHelp: {
    fontSize: FONT_SIZES.SMALL,
  },
  list: {
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingTop: SPACING.SMALL,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.TINY + 2,
    paddingHorizontal: SPACING.SMALL,
  },
  tabLabel: {
    fontSize: FONT_SIZES.SMALL,
  },
  themeCard: {
    padding: SPACING.SMALL,
    gap: SPACING.TINY,
    borderWidth: 2,
  },
  themeSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    marginBottom: SPACING.TINY,
  },
  themeSwatchChip: {
    width: 34,
    height: 18,
  },
  themeSwatchCard: {
    width: 44,
    height: 18,
  },
  themeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeName: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '700',
  },
  themeTagline: {
    fontSize: FONT_SIZES.TINY,
  },
  rowLabel: {
    fontSize: FONT_SIZES.SMALL,
    flex: 1,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  autoButton: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderWidth: 1,
  },
  autoText: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingHorizontal: SPACING.TINY,
    paddingVertical: 2,
    borderWidth: 1,
  },
  stepperButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCount: {
    fontSize: FONT_SIZES.SMALL,
    minWidth: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  sortRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingRight: SPACING.SMALL,
    borderBottomWidth: 1,
  },
  dragHandle: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    gap: SPACING.MEDIUM,
  },
  modeDescription: {
    fontSize: FONT_SIZES.TINY,
    marginTop: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
