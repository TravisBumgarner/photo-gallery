import { MaterialIcons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Sortable from 'react-native-sortables';

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
  useSettings,
} from '../lib/settings';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

const SECTION_LABELS: Record<FilterSectionKey, string> = Object.fromEntries(
  FILTER_SECTIONS.map((s) => [s.key, s.label]),
) as Record<FilterSectionKey, string>;

// react-native-web honours the `grab`/`grabbing` cursor; RN's `CursorValue`
// type only allows auto/pointer, so cast past it for the web-only hint.
const GRAB_CURSOR = { cursor: 'grab' } as unknown as ViewStyle;

export default function SettingsPanel() {
  const palette = usePalette();
  const settings = useSettings();
  const { width } = useWindowDimensions();

  const order = settings.filterSectionOrder;
  const autoColumns = getAutoColumnCount(width);
  const isAutoColumns = settings.columnCount == null;
  const effectiveColumns = settings.columnCount ?? autoColumns;

  return (
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
          style={[
            styles.list,
            { backgroundColor: palette.surface, borderColor: palette.divider },
          ]}
        >
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
            <View style={[styles.stepper, { borderColor: palette.divider }]}>
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
          style={[
            styles.list,
            { backgroundColor: palette.surface, borderColor: palette.divider },
          ]}
        >
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
              <Switch
                value={settings.visibleFilterSections[key]}
                onValueChange={(next) => setSectionVisible(key, next)}
              />
            </View>
          )}
        />
      </View>
    </ScrollView>
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
  palette: ReturnType<typeof usePalette>;
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
      <MaterialIcons name={icon} size={20} color={palette.textPrimary} />
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
    borderWidth: 1,
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
    borderRadius: 999,
  },
  autoText: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderRadius: 999,
    borderWidth: 1,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCount: {
    fontSize: FONT_SIZES.MEDIUM,
    minWidth: 22,
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
