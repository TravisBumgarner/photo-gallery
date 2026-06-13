import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../lib/api';
import {
  FILTER_SECTIONS,
  type FilterSectionKey,
  setAllFilterSectionsExpanded,
  toggleFilterSectionExpanded,
  useSettings,
} from '../lib/settings';
import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import SharedCollapsibleSection from './CollapsibleSection';
import DateRangeCalendar from './DateRangeCalendar';
import FilterListModal, {
  type FilterListOption,
} from './FilterListModal';
import RangeSlider from './RangeSlider';
import { Tooltip } from './Tooltip';

type ListModalKey = 'camera' | 'lens' | 'keywords' | 'people' | 'dogs';

interface FilterPanelProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
}

const LABEL_OPTIONS = ['Red', 'Yellow', 'Green', 'Blue', 'Purple'];
const ASPECT_OPTIONS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'];
const ORIENTATION_OPTIONS = ['landscape', 'portrait', 'square'];
const LABEL_COLORS: Record<string, string> = {
  Red: '#f44336',
  Yellow: '#ffeb3b',
  Green: '#4caf50',
  Blue: '#2196f3',
  Purple: '#9c27b0',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface LabelOption {
  label: string;
  count: number;
}

function countCsv(value: string | undefined): number {
  if (!value) return 0;
  return value.split(',').filter(Boolean).length;
}

function getSectionActiveCount(
  key: FilterSectionKey,
  filters: PhotoFilters,
): number {
  switch (key) {
    case 'rating':
      return filters.rating && filters.rating > 0 ? 1 : 0;
    case 'label':
      return filters.label ? 1 : 0;
    case 'aspectRatio':
      return filters.aspectRatio ? 1 : 0;
    case 'orientation':
      return filters.orientation ? 1 : 0;
    case 'camera':
      return countCsv(filters.camera);
    case 'lens':
      return countCsv(filters.lens);
    case 'dateRange':
      return filters.startDate || filters.endDate ? 1 : 0;
    case 'calendar':
      return countCsv(filters.selectedMonths) + countCsv(filters.selectedDates);
    case 'iso':
      return filters.minIso !== undefined || filters.maxIso !== undefined
        ? 1
        : 0;
    case 'aperture':
      return filters.minAperture !== undefined ||
        filters.maxAperture !== undefined
        ? 1
        : 0;
    case 'keywords':
      return countCsv(filters.keyword);
    case 'people':
      return countCsv(filters.people);
    case 'dogs':
      return countCsv(filters.dogs);
    default:
      return 0;
  }
}

/** Filter-key patch that resets a section to its inactive state. */
function getSectionClear(key: FilterSectionKey): Partial<PhotoFilters> {
  switch (key) {
    case 'rating':
      return { rating: undefined };
    case 'label':
      return { label: undefined };
    case 'aspectRatio':
      return { aspectRatio: undefined };
    case 'orientation':
      return { orientation: undefined };
    case 'camera':
      return { camera: undefined };
    case 'lens':
      return { lens: undefined };
    case 'dateRange':
      return { startDate: undefined, endDate: undefined };
    case 'calendar':
      return { selectedMonths: undefined, selectedDates: undefined };
    case 'iso':
      return { minIso: undefined, maxIso: undefined };
    case 'aperture':
      return { minAperture: undefined, maxAperture: undefined };
    case 'keywords':
      return { keyword: undefined };
    case 'people':
      return { people: undefined };
    case 'dogs':
      return { dogs: undefined };
    default:
      return {};
  }
}

export default function FilterPanel({
  filters,
  onFilterChange,
}: FilterPanelProps) {
  const palette = usePalette();
  const {
    visibleFilterSections: visibleSections,
    expandedFilterSections: expandedSections,
    filterSectionMode,
    filterSectionOrder,
  } = useSettings();

  const [people, setPeople] = useState<LabelOption[]>([]);
  const [dogs, setDogs] = useState<LabelOption[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordCounts, setKeywordCounts] = useState<Record<string, number>>(
    {},
  );
  const [cameras, setCameras] = useState<string[]>([]);
  const [cameraCounts, setCameraCounts] = useState<Record<string, number>>({});
  const [lenses, setLenses] = useState<string[]>([]);
  const [lensCounts, setLensCounts] = useState<Record<string, number>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [dateCounts, setDateCounts] = useState<Record<string, number>>({});
  const [isoValues, setIsoValues] = useState<number[]>([]);
  const [apertureValues, setApertureValues] = useState<number[]>([]);
  const [openListModal, setOpenListModal] = useState<ListModalKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/people/labels')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const rows: { personLabel: string; faceCount: number }[] =
          data.labels ?? [];
        setPeople(
          rows.map((r) => ({ label: r.personLabel, count: r.faceCount })),
        );
      })
      .catch(() => {});
    apiFetch('/api/dogs/labels')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const rows: { dogLabel: string; dogCount: number }[] =
          data.labels ?? [];
        setDogs(
          rows.map((r) => ({ label: r.dogLabel, count: r.dogCount })),
        );
      })
      .catch(() => {});
    apiFetch('/api/photos/meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setKeywords(data.keywords ?? []);
        setKeywordCounts(data.keywordCounts ?? {});
        setCameras(data.cameras ?? []);
        setCameraCounts(data.cameraCounts ?? {});
        setLenses(data.lenses ?? []);
        setLensCounts(data.lensCounts ?? {});
        setDates(data.dates ?? []);
        setDateCounts(data.dateCounts ?? {});
        setIsoValues(
          Array.isArray(data.isoValues)
            ? (data.isoValues as number[]).filter((v) => Number.isFinite(v))
            : [],
        );
        setApertureValues(
          Array.isArray(data.apertureValues)
            ? (data.apertureValues as number[]).filter((v) =>
                Number.isFinite(v),
              )
            : [],
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A section is shown only when toggled visible AND it has data to filter on.
  const sectionAvailable: Record<FilterSectionKey, boolean> = {
    rating: true,
    label: true,
    aspectRatio: true,
    orientation: true,
    camera: cameras.length > 0,
    lens: lenses.length > 0,
    dateRange: true,
    calendar: true,
    iso: isoValues.length >= 2,
    aperture: apertureValues.length >= 2,
    keywords: keywords.length > 0,
    people: people.length > 0,
    dogs: dogs.length > 0,
  };

  // Sections render in the user's saved order (configured in Settings); the
  // sidebar itself is not reorderable.
  const orderedKeys = filterSectionOrder.filter(
    (k) => visibleSections[k] && sectionAvailable[k],
  );

  const sectionTitle = (key: FilterSectionKey): string => {
    switch (key) {
      case 'camera':
        return `Camera (${cameras.length})`;
      case 'lens':
        return `Lens (${lenses.length})`;
      case 'keywords':
        return `Keywords (${keywords.length})`;
      case 'people':
        return `People (${people.length})`;
      case 'dogs':
        return `Dogs (${dogs.length})`;
      default:
        return FILTER_SECTIONS.find((s) => s.key === key)?.label ?? key;
    }
  };

  const sectionAction = (key: FilterSectionKey): React.ReactNode => {
    const expand = (modal: ListModalKey, label: string) => (
      <ExpandSectionButton
        onPress={() => setOpenListModal(modal)}
        palette={palette}
        label={label}
      />
    );
    switch (key) {
      case 'camera':
        return expand('camera', 'Expand Camera filter');
      case 'lens':
        return expand('lens', 'Expand Lens filter');
      case 'keywords':
        return expand('keywords', 'Expand Keywords filter');
      case 'people':
        return expand('people', 'Expand People filter');
      case 'dogs':
        return expand('dogs', 'Expand Dogs filter');
      default:
        return undefined;
    }
  };

  const renderSectionContent = (key: FilterSectionKey): React.ReactNode => {
    switch (key) {
      case 'rating':
        return (
          <View style={styles.row}>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <ToggleChip
                key={r}
                label={r === 0 ? 'Any' : `${r}+`}
                active={(filters.rating ?? 0) === r}
                onPress={() =>
                  onFilterChange({ rating: r === 0 ? undefined : r })
                }
                palette={palette}
              />
            ))}
          </View>
        );
      case 'label':
        return (
          <View style={styles.row}>
            <ToggleChip
              label="Any"
              active={!filters.label}
              onPress={() => onFilterChange({ label: undefined })}
              palette={palette}
            />
            {LABEL_OPTIONS.map((label) => (
              <Pressable
                key={label}
                onPress={() =>
                  onFilterChange({
                    label: filters.label === label ? undefined : label,
                  })
                }
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: LABEL_COLORS[label],
                    opacity: filters.label === label ? 1 : 0.55,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: label === 'Yellow' ? '#000' : '#fff' },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      case 'aspectRatio':
        return (
          <View style={styles.row}>
            <ToggleChip
              label="Any"
              active={!filters.aspectRatio}
              onPress={() => onFilterChange({ aspectRatio: undefined })}
              palette={palette}
            />
            {ASPECT_OPTIONS.map((r) => (
              <ToggleChip
                key={r}
                label={r}
                active={filters.aspectRatio === r}
                onPress={() =>
                  onFilterChange({
                    aspectRatio: filters.aspectRatio === r ? undefined : r,
                  })
                }
                palette={palette}
              />
            ))}
          </View>
        );
      case 'orientation':
        return (
          <View style={styles.row}>
            <ToggleChip
              label="Any"
              active={!filters.orientation}
              onPress={() => onFilterChange({ orientation: undefined })}
              palette={palette}
            />
            {ORIENTATION_OPTIONS.map((o) => (
              <ToggleChip
                key={o}
                label={o}
                active={filters.orientation === o}
                onPress={() =>
                  onFilterChange({
                    orientation: filters.orientation === o ? undefined : o,
                  })
                }
                palette={palette}
              />
            ))}
          </View>
        );
      case 'camera':
        return (
          <MultiSelectStringChips
            options={cameras}
            value={filters.camera ?? ''}
            onChange={(v) => onFilterChange({ camera: v ? v : undefined })}
            palette={palette}
          />
        );
      case 'lens':
        return (
          <MultiSelectStringChips
            options={lenses}
            value={filters.lens ?? ''}
            onChange={(v) => onFilterChange({ lens: v ? v : undefined })}
            palette={palette}
          />
        );
      case 'dateRange':
        return (
          <DateRangeCalendar
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={(start, end) =>
              onFilterChange({
                startDate: start,
                endDate: end,
                selectedMonths: undefined,
                selectedDates: undefined,
              })
            }
          />
        );
      case 'calendar':
        return (
          <CalendarFilter
            dates={dates}
            dateCounts={dateCounts}
            selectedMonths={filters.selectedMonths ?? ''}
            selectedDates={filters.selectedDates ?? ''}
            onChange={(months, days) =>
              onFilterChange({
                selectedMonths: months || undefined,
                selectedDates: days || undefined,
                startDate: undefined,
                endDate: undefined,
              })
            }
            palette={palette}
          />
        );
      case 'iso':
        return (
          <RangeSlider
            values={isoValues}
            low={filters.minIso}
            high={filters.maxIso}
            onChange={(low, high) =>
              onFilterChange({ minIso: low, maxIso: high })
            }
            formatValue={(v) => String(v)}
          />
        );
      case 'aperture':
        return (
          <RangeSlider
            values={apertureValues}
            low={filters.minAperture}
            high={filters.maxAperture}
            onChange={(low, high) =>
              onFilterChange({ minAperture: low, maxAperture: high })
            }
            formatValue={(v) => `f/${v}`}
          />
        );
      case 'keywords':
        return (
          <MultiSelectStringChips
            options={keywords}
            value={filters.keyword ?? ''}
            onChange={(v) => onFilterChange({ keyword: v ? v : undefined })}
            palette={palette}
          />
        );
      case 'people':
        return (
          <MultiSelectChips
            options={people}
            value={filters.people ?? ''}
            onChange={(v) => onFilterChange({ people: v })}
            palette={palette}
          />
        );
      case 'dogs':
        return (
          <MultiSelectChips
            options={dogs}
            value={filters.dogs ?? ''}
            onChange={(v) => onFilterChange({ dogs: v })}
            palette={palette}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
        {filterSectionMode === 'multiple' ? (
          <View
            style={[
              styles.expandControls,
              {
                backgroundColor: palette.surface,
                borderBottomColor: palette.divider,
              },
            ]}
          >
            <Pressable
              onPress={() => setAllFilterSectionsExpanded(true)}
              accessibilityLabel="Expand all filter sections"
              style={({ pressed }) => [
                styles.expandControlButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.expandControlText,
                  { color: palette.textSecondary },
                ]}
              >
                Expand all
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAllFilterSectionsExpanded(false)}
              accessibilityLabel="Collapse all filter sections"
              style={({ pressed }) => [
                styles.expandControlButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.expandControlText,
                  { color: palette.textSecondary },
                ]}
              >
                Collapse all
              </Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.SMALL, gap: SPACING.SMALL }}
        >
          {orderedKeys.map((item) => (
            <CollapsibleSection
              key={item}
              sectionKey={item}
              title={sectionTitle(item)}
              palette={palette}
              expanded={expandedSections[item]}
              activeCount={getSectionActiveCount(item, filters)}
              onFilterChange={onFilterChange}
              action={sectionAction(item)}
            >
              {renderSectionContent(item)}
            </CollapsibleSection>
          ))}
        </ScrollView>
        {(() => {
          if (!openListModal) return null;
          let title = '';
          let options: FilterListOption[] = [];
          let value = '';
          let onChange: (v: string) => void = () => {};
          if (openListModal === 'camera') {
            title = 'Camera';
            options = cameras.map((c) => ({
              label: c,
              count: cameraCounts[c],
            }));
            value = filters.camera ?? '';
            onChange = (v) => onFilterChange({ camera: v ? v : undefined });
          } else if (openListModal === 'lens') {
            title = 'Lens';
            options = lenses.map((l) => ({ label: l, count: lensCounts[l] }));
            value = filters.lens ?? '';
            onChange = (v) => onFilterChange({ lens: v ? v : undefined });
          } else if (openListModal === 'keywords') {
            title = 'Keywords';
            options = keywords.map((k) => ({
              label: k,
              count: keywordCounts[k],
            }));
            value = filters.keyword ?? '';
            onChange = (v) => onFilterChange({ keyword: v ? v : undefined });
          } else if (openListModal === 'people') {
            title = 'People';
            options = people.map((p) => ({ label: p.label, count: p.count }));
            value = filters.people ?? '';
            onChange = (v) => onFilterChange({ people: v });
          } else if (openListModal === 'dogs') {
            title = 'Dogs';
            options = dogs.map((d) => ({ label: d.label, count: d.count }));
            value = filters.dogs ?? '';
            onChange = (v) => onFilterChange({ dogs: v });
          }
          return (
            <FilterListModal
              visible
              title={title}
              options={options}
              value={value}
              onChange={onChange}
              onClose={() => setOpenListModal(null)}
            />
          );
        })()}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

/**
 * Active-filter indicator shown in a section header: a filter icon that turns
 * into an X on hover (web) and clears the section's filter on press.
 */
export function FilterBadge({
  label,
  palette,
  onClear,
}: {
  label: string;
  palette: ReturnType<typeof usePalette>;
  onClear: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip title={`Clear ${label} filter`}>
      <Pressable
        onPress={onClear}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityLabel={`Clear ${label} filter`}
        hitSlop={6}
        style={[styles.activeBadge, { backgroundColor: palette.primary }]}
      >
        <MaterialIcons
          name={hovered ? 'close' : 'filter-alt'}
          size={12}
          color={palette.primaryContrast}
        />
      </Pressable>
    </Tooltip>
  );
}

function CollapsibleSection({
  sectionKey,
  title,
  palette,
  children,
  action,
  expanded,
  activeCount,
  onFilterChange,
}: {
  sectionKey: FilterSectionKey;
  title: string;
  palette: ReturnType<typeof usePalette>;
  children: React.ReactNode;
  action?: React.ReactNode;
  expanded: boolean;
  activeCount: number;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
}) {
  const isActive = activeCount > 0;
  return (
    <SharedCollapsibleSection
      title={title}
      expanded={expanded}
      onToggle={() => toggleFilterSectionExpanded(sectionKey)}
      active={isActive}
      action={action}
      badge={
        isActive ? (
          <FilterBadge
            label={title}
            palette={palette}
            onClear={() => onFilterChange(getSectionClear(sectionKey))}
          />
        ) : null
      }
    >
      {children}
    </SharedCollapsibleSection>
  );
}

export function ExpandSectionButton({
  onPress,
  palette,
  label,
}: {
  onPress: () => void;
  palette: ReturnType<typeof usePalette>;
  label: string;
}) {
  return (
    <Tooltip title={label}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        hitSlop={6}
        style={({ pressed }) => [
          styles.expandButton,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons
          name="open-in-full"
          size={14}
          color={palette.textSecondary}
        />
      </Pressable>
    </Tooltip>
  );
}

function ToggleChip({
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
        styles.chip,
        {
          backgroundColor: active ? palette.primary : palette.surface,
          borderColor: active ? palette.primary : palette.divider,
          borderWidth: 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? palette.primaryContrast : palette.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MultiSelectChips({
  options,
  value,
  onChange,
  palette,
}: {
  options: LabelOption[];
  value: string;
  onChange: (next: string) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const selected = new Set(value ? value.split(',').filter(Boolean) : []);
  const toggle = (label: string) => {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(Array.from(next).join(','));
  };
  return (
    <ScrollView style={styles.chipScroll} nestedScrollEnabled>
      <View style={styles.row}>
        <ToggleChip
          label="Any"
          active={selected.size === 0}
          onPress={() => onChange('')}
          palette={palette}
        />
        {options.map((o) => (
          <ToggleChip
            key={o.label}
            label={`${o.label} (${o.count})`}
            active={selected.has(o.label)}
            onPress={() => toggle(o.label)}
            palette={palette}
          />
        ))}
      </View>
    </ScrollView>
  );
}

export function MultiSelectStringChips({
  options,
  value,
  onChange,
  palette,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const selected = new Set(value ? value.split(',').filter(Boolean) : []);
  const toggle = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange(Array.from(next).join(','));
  };
  return (
    <ScrollView style={styles.chipScroll} nestedScrollEnabled>
      <View style={styles.row}>
        <ToggleChip
          label="Any"
          active={selected.size === 0}
          onPress={() => onChange('')}
          palette={palette}
        />
        {options.map((item) => (
          <ToggleChip
            key={item}
            label={item}
            active={selected.has(item)}
            onPress={() => toggle(item)}
            palette={palette}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function CalendarFilter({
  dates,
  dateCounts,
  selectedMonths,
  selectedDates,
  onChange,
  palette,
}: {
  dates: string[];
  dateCounts: Record<string, number>;
  selectedMonths: string;
  selectedDates: string;
  onChange: (months: string, days: string) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (dates.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
        No dates available
      </Text>
    );
  }

  const monthSet = new Set(
    selectedMonths ? selectedMonths.split(',').filter(Boolean) : [],
  );
  const daySet = new Set(
    selectedDates ? selectedDates.split(',').filter(Boolean) : [],
  );

  const yearGroups: Record<string, Record<string, string[]>> = {};
  for (const date of dates) {
    const year = date.substring(0, 4);
    const monthKey = date.substring(0, 7);
    if (!yearGroups[year]) yearGroups[year] = {};
    if (!yearGroups[year][monthKey]) yearGroups[year][monthKey] = [];
    yearGroups[year][monthKey].push(date);
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    const next = new Set(monthSet);
    if (next.has(monthKey)) next.delete(monthKey);
    else next.add(monthKey);
    onChange(Array.from(next).join(','), Array.from(daySet).join(','));
  };

  const toggleAllMonthsInYear = (monthKeys: string[]) => {
    const allSelected = monthKeys.every((m) => monthSet.has(m));
    const next = new Set(monthSet);
    if (allSelected) {
      monthKeys.forEach((m) => next.delete(m));
    } else {
      monthKeys.forEach((m) => next.add(m));
    }
    onChange(Array.from(next).join(','), Array.from(daySet).join(','));
  };

  const toggleDate = (dateStr: string) => {
    const next = new Set(daySet);
    if (next.has(dateStr)) next.delete(dateStr);
    else next.add(dateStr);
    onChange(Array.from(monthSet).join(','), Array.from(next).join(','));
  };

  const years = Object.keys(yearGroups).sort((a, b) => b.localeCompare(a));

  return (
    <View style={{ gap: SPACING.TINY }}>
      {selectedMonths || selectedDates ? (
        <Pressable
          onPress={() => onChange('', '')}
          style={({ pressed }) => [
            styles.clearAllButton,
            {
              borderColor: palette.divider,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text
            style={[styles.clearAllText, { color: palette.textSecondary }]}
          >
            Clear calendar selection
          </Text>
        </Pressable>
      ) : null}
      {years.map((year) => {
        const months = yearGroups[year];
        const monthKeys = Object.keys(months).sort((a, b) =>
          b.localeCompare(a),
        );
        const yearTotal = monthKeys.reduce(
          (sum, mk) =>
            sum +
            months[mk].reduce((s, d) => s + (dateCounts[d] || 0), 0),
          0,
        );
        const allMonthsInYear = monthKeys.every((mk) => monthSet.has(mk));
        const someMonthsInYear = monthKeys.some((mk) => monthSet.has(mk));
        const isYearExpanded = expanded.has(year);
        return (
          <View key={year}>
            <View
              style={[
                styles.calRow,
                {
                  backgroundColor: allMonthsInYear
                    ? palette.primary
                    : someMonthsInYear
                      ? palette.surfaceElevated
                      : palette.surface,
                },
              ]}
            >
              <Pressable
                onPress={() => toggleExpand(year)}
                style={({ pressed }) => [
                  styles.calRowLabel,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <MaterialIcons
                  name={isYearExpanded ? 'expand-more' : 'chevron-right'}
                  size={16}
                  color={
                    allMonthsInYear
                      ? palette.primaryContrast
                      : palette.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.calRowText,
                    {
                      color: allMonthsInYear
                        ? palette.primaryContrast
                        : palette.textPrimary,
                      fontWeight: '600',
                    },
                  ]}
                >
                  {year} ({yearTotal})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleAllMonthsInYear(monthKeys)}
                accessibilityLabel={
                  allMonthsInYear ? 'Deselect year' : 'Select year'
                }
                style={({ pressed }) => [
                  styles.calToggle,
                  {
                    borderColor: allMonthsInYear
                      ? palette.primaryContrast
                      : palette.textSecondary,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <MaterialIcons
                  name="calendar-today"
                  size={12}
                  color={
                    allMonthsInYear
                      ? palette.primaryContrast
                      : palette.textSecondary
                  }
                />
              </Pressable>
            </View>
            {isYearExpanded ? (
              <View style={{ paddingLeft: SPACING.SMALL }}>
                {monthKeys.map((monthKey) => {
                  const monthDates = months[monthKey];
                  const isMonthSelected = monthSet.has(monthKey);
                  const isMonthExpanded = expanded.has(monthKey);
                  const monthTotal = monthDates.reduce(
                    (sum, d) => sum + (dateCounts[d] || 0),
                    0,
                  );
                  const monthNum = parseInt(monthKey.substring(5, 7), 10) - 1;
                  const yearNum = parseInt(monthKey.substring(0, 4), 10);
                  return (
                    <View key={monthKey}>
                      <View
                        style={[
                          styles.calRow,
                          {
                            backgroundColor: isMonthSelected
                              ? palette.primary
                              : palette.surface,
                          },
                        ]}
                      >
                        <Pressable
                          onPress={() => toggleExpand(monthKey)}
                          style={({ pressed }) => [
                            styles.calRowLabel,
                            { opacity: pressed ? 0.6 : 1 },
                          ]}
                        >
                          <MaterialIcons
                            name={
                              isMonthExpanded ? 'expand-more' : 'chevron-right'
                            }
                            size={14}
                            color={
                              isMonthSelected
                                ? palette.primaryContrast
                                : palette.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.calRowText,
                              {
                                color: isMonthSelected
                                  ? palette.primaryContrast
                                  : palette.textPrimary,
                              },
                            ]}
                          >
                            {MONTH_NAMES[monthNum]} ({monthTotal})
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => toggleMonth(monthKey)}
                          accessibilityLabel={
                            isMonthSelected
                              ? 'Deselect month'
                              : 'Select month'
                          }
                          style={({ pressed }) => [
                            styles.calToggle,
                            {
                              borderColor: isMonthSelected
                                ? palette.primaryContrast
                                : palette.textSecondary,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}
                        >
                          <MaterialIcons
                            name="calendar-today"
                            size={12}
                            color={
                              isMonthSelected
                                ? palette.primaryContrast
                                : palette.textSecondary
                            }
                          />
                        </Pressable>
                      </View>
                      {isMonthExpanded ? (
                        <CalendarMonthGrid
                          year={yearNum}
                          month={monthNum}
                          dateCounts={dateCounts}
                          selectedDates={daySet}
                          onToggle={toggleDate}
                          palette={palette}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CalendarMonthGrid({
  year,
  month,
  dateCounts,
  selectedDates,
  onToggle,
  palette,
}: {
  year: number;
  month: number;
  dateCounts: Record<string, number>;
  selectedDates: Set<string>;
  onToggle: (dateStr: string) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(<View key={`pad-${i}`} style={styles.dayCell} />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = dateCounts[dateStr] || 0;
    const isSelected = selectedDates.has(dateStr);
    const hasPhotos = count > 0;
    cells.push(
      <Pressable
        key={dateStr}
        onPress={() => {
          if (hasPhotos) onToggle(dateStr);
        }}
        style={({ pressed }) => [
          styles.dayCell,
          {
            backgroundColor: isSelected
              ? palette.primary
              : hasPhotos
                ? palette.surfaceElevated
                : 'transparent',
            opacity: pressed && hasPhotos ? 0.6 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.dayCellText,
            {
              color: isSelected
                ? palette.primaryContrast
                : hasPhotos
                  ? palette.textPrimary
                  : palette.textSecondary,
            },
          ]}
        >
          {day}
        </Text>
        {hasPhotos ? (
          <Text
            style={[
              styles.dayCellCount,
              {
                color: isSelected
                  ? palette.primaryContrast
                  : palette.textSecondary,
              },
            ]}
          >
            {count}
          </Text>
        ) : null}
      </Pressable>,
    );
  }

  return (
    <View style={{ paddingVertical: SPACING.TINY }}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text
            key={i}
            style={[styles.weekdayLabel, { color: palette.textSecondary }]}
          >
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.dayGrid}>{cells}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  expandControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderBottomWidth: 1,
  },
  expandControlButton: {
    paddingHorizontal: SPACING.TINY,
    paddingVertical: SPACING.TINY,
  },
  expandControlText: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  activeBadge: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  expandButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.TINY,
  },
  chipScroll: {
    maxHeight: 160,
  },
  chip: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
  },
  chipText: {
    fontSize: FONT_SIZES.SMALL,
  },
  emptyText: {
    fontSize: FONT_SIZES.SMALL,
    paddingVertical: SPACING.SMALL,
  },
  clearAllButton: {
    borderWidth: 1,
    paddingVertical: SPACING.TINY,
    paddingHorizontal: SPACING.SMALL,
    alignSelf: 'flex-start',
  },
  clearAllText: {
    fontSize: FONT_SIZES.TINY,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.TINY,
    paddingHorizontal: SPACING.TINY,
    gap: SPACING.TINY,
  },
  calRowLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    minWidth: 0,
  },
  calRowText: {
    fontSize: FONT_SIZES.SMALL,
  },
  calToggle: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellText: {
    fontSize: FONT_SIZES.TINY,
  },
  dayCellCount: {
    fontSize: 8,
    opacity: 0.7,
  },
});
