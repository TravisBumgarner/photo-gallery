import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { apiFetch } from '../lib/api';
import {
  addRecentSearch,
  clearRecentSearches,
  type RecentKind,
  type RecentSearch,
  removeRecentSearch,
  useRecentSearches,
} from '../lib/recentSearches';
import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import type { Palette } from '../styles/usePalette';
import { useTheme } from '../styles/useTheme';
import Collapsible from './Collapsible';

/** Recents shown before the "show more" row takes over. */
const COLLAPSED_RECENTS = 5;

type SuggestionKind = 'file' | 'camera' | 'keyword' | 'person' | 'dog';

const FILTERABLE_KINDS = ['person', 'dog', 'keyword', 'camera'] as const;
type FilterableKind = (typeof FILTERABLE_KINDS)[number];

function isFilterable(
  kind: SuggestionKind | RecentKind,
): kind is FilterableKind {
  return (FILTERABLE_KINDS as readonly string[]).includes(kind);
}

interface Suggestion {
  value: string;
  kind: SuggestionKind;
}

interface SearchPanelProps {
  value: string;
  onChange: (value: string) => void;
  onContentSearch: (value: string) => void;
  onApplyFilter: (changed: Partial<PhotoFilters>) => void;
  peopleFilter?: string;
  dogsFilter?: string;
  keywordFilter?: string;
  cameraFilter?: string;
  /**
   * A search or suggestion was committed. The host decides whether that also
   * dismisses the panel — on desktop it stays open so filters can be stacked.
   */
  onCommit: () => void;
}

interface GroupedSuggestions {
  cameras?: string[];
  keywords?: string[];
  files?: string[];
  people?: string[];
  dogs?: string[];
}

interface OptionGroup {
  title: string;
  kind: SuggestionKind;
  options: string[];
}

const KIND_ICON: Record<
  SuggestionKind,
  React.ComponentProps<typeof MaterialIcons>['name']
> = {
  file: 'photo',
  camera: 'camera-alt',
  keyword: 'label',
  person: 'person',
  dog: 'pets',
};

const RECENT_KIND_ICON: Record<
  RecentSearch['kind'],
  React.ComponentProps<typeof MaterialIcons>['name']
> = {
  search: 'history',
  ai: 'auto-awesome',
  person: 'person',
  dog: 'pets',
  keyword: 'label',
  camera: 'camera-alt',
};

function appendToCommaList(current: string | undefined, value: string): string {
  const parts = new Set(
    (current ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  );
  parts.add(value);
  return Array.from(parts).join(',');
}

export default function SearchPanel({
  value,
  onChange,
  onContentSearch,
  onApplyFilter,
  peopleFilter,
  dogsFilter,
  keywordFilter,
  cameraFilter,
  onCommit,
}: SearchPanelProps) {
  const theme = useTheme();
  const palette = theme.colors;
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [groupedOptions, setGroupedOptions] = useState<OptionGroup[]>([]);
  const [showGrouped, setShowGrouped] = useState(value.length === 0);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const recents = useRecentSearches();

  // Autofocus the field as soon as the panel mounts.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Prime the grouped (browse-all) suggestions whenever the query is empty.
  // Deliberately not mount-only: the panel can open with a query already in the
  // box (reopening after a search), which skips the fetch — then clearing the
  // box would leave nothing to browse but recents. Refetch is guarded on the
  // list already being populated, so this runs at most once per mount.
  useEffect(() => {
    if (inputValue.length !== 0) return;
    if (groupedOptions.length > 0) return;
    setLoading(true);
    apiFetch('/api/photos/suggestions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GroupedSuggestions | null) => {
        if (!data) return;
        const grouped: OptionGroup[] = [];
        if (data.people?.length)
          grouped.push({
            title: 'People',
            kind: 'person',
            options: data.people,
          });
        if (data.dogs?.length)
          grouped.push({ title: 'Dogs', kind: 'dog', options: data.dogs });
        if (data.keywords?.length)
          grouped.push({
            title: 'Keywords',
            kind: 'keyword',
            options: data.keywords,
          });
        if (data.cameras?.length)
          grouped.push({
            title: 'Cameras',
            kind: 'camera',
            options: data.cameras,
          });
        if (data.files?.length)
          grouped.push({
            title: 'Recent Files',
            kind: 'file',
            options: data.files,
          });
        setGroupedOptions(grouped);
        setShowGrouped(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [inputValue, groupedOptions.length]);

  // Debounced autocomplete lookup once input is meaningful.
  useEffect(() => {
    if (inputValue.length < 2) {
      setOptions([]);
      setShowGrouped(inputValue.length === 0);
      setLoading(false);
      return;
    }
    setShowGrouped(false);
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(
        `/api/photos/autocomplete?query=${encodeURIComponent(inputValue)}`,
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((data: unknown) => {
          if (!Array.isArray(data)) {
            setOptions([]);
            return;
          }
          // Tolerate legacy string[] response shape during deploys.
          const normalized: Suggestion[] = data
            .map((row): Suggestion | null => {
              if (typeof row === 'string') {
                return { value: row, kind: 'keyword' };
              }
              if (
                row &&
                typeof row === 'object' &&
                typeof (row as Suggestion).value === 'string' &&
                typeof (row as Suggestion).kind === 'string'
              ) {
                return row as Suggestion;
              }
              return null;
            })
            .filter((s): s is Suggestion => s !== null);
          setOptions(normalized);
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Kinds that map onto a real comma-separated filter: picking one stacks it
  // onto that filter instead of typing it into the search box, so keywords and
  // cameras behave like people and dogs. 'file' has no filter — it stays a text
  // search — and 'search'/'ai' are recent-only kinds that are never filters.
  const filterFor: Record<
    FilterableKind,
    { key: keyof PhotoFilters; current?: string }
  > = {
    person: { key: 'people', current: peopleFilter },
    dog: { key: 'dogs', current: dogsFilter },
    keyword: { key: 'keyword', current: keywordFilter },
    camera: { key: 'camera', current: cameraFilter },
  };

  const applyFilterFor = (kind: FilterableKind, value: string) => {
    const target = filterFor[kind];
    onApplyFilter({ [target.key]: appendToCommaList(target.current, value) });
    onChange('');
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    if (isFilterable(suggestion.kind)) {
      applyFilterFor(suggestion.kind, suggestion.value);
      addRecentSearch({ value: suggestion.value, kind: suggestion.kind });
    } else {
      onChange(suggestion.value);
      addRecentSearch({ value: suggestion.value, kind: 'search' });
    }
    onCommit();
  };

  const selectRecent = (entry: RecentSearch) => {
    if (isFilterable(entry.kind)) {
      applyFilterFor(entry.kind, entry.value);
    } else if (entry.kind === 'ai') {
      onContentSearch(entry.value);
    } else {
      onChange(entry.value);
    }
    // Promote this entry to the top of the list.
    addRecentSearch(entry);
    onCommit();
  };

  const selectContent = () => {
    if (!inputValue) return;
    onContentSearch(inputValue);
    addRecentSearch({ value: inputValue, kind: 'ai' });
    onCommit();
  };

  const clear = () => {
    setInputValue('');
    onChange('');
  };

  const hasGroupedToShow = showGrouped && groupedOptions.length > 0;
  const hasOptionsToShow = !showGrouped && options.length > 0;
  const hasRecentsToShow = showGrouped && recents.length > 0;

  // Recents are collapsed to 5 so they don't crowd out the browse-all groups
  // below them; the rest are one tap away.
  const visibleRecents = showAllRecents
    ? recents
    : recents.slice(0, COLLAPSED_RECENTS);
  const hiddenRecentCount = recents.length - visibleRecents.length;
  const canToggleRecents =
    hasRecentsToShow && (hiddenRecentCount > 0 || showAllRecents);

  // Rendering splits the recents differently from `visibleRecents`: the first
  // page always renders, and the overflow stays mounted inside a Collapsible so
  // toggling "show more" animates open/closed instead of snapping.
  const pinnedRecents = recents.slice(0, COLLAPSED_RECENTS);
  const overflowRecents = recents.slice(COLLAPSED_RECENTS);

  // Every selectable row, in the same order they're rendered below, so the
  // keyboard highlight and the list stay in lockstep. Rows are matched by key
  // at render time rather than by re-deriving indices in two places.
  const rows: { key: string; run: () => void }[] = [];
  if (inputValue.length > 0) rows.push({ key: '__ai', run: selectContent });
  if (hasRecentsToShow)
    for (const entry of visibleRecents)
      rows.push({
        key: `recent:${entry.kind}:${entry.value}`,
        run: () => selectRecent(entry),
      });
  if (hasGroupedToShow)
    for (const group of groupedOptions)
      for (const opt of group.options)
        rows.push({
          key: `${group.title}:${opt}`,
          run: () => selectSuggestion({ value: opt, kind: group.kind }),
        });
  if (hasOptionsToShow)
    for (const opt of options)
      rows.push({
        key: `${opt.kind}:${opt.value}`,
        run: () => selectSuggestion(opt),
      });

  // Touch devices have no arrow keys and no pointer to follow, so a highlight
  // there would just be a row that looks pressed for no reason.
  const canHighlight =
    Platform.OS === 'web' && inputValue.length > 0 && rows.length > 0;
  const activeIndex = Math.min(highlightedIndex, rows.length - 1);
  const isHighlighted = (key: string) =>
    canHighlight && rows[activeIndex]?.key === key;

  // Retyping re-ranks the list, so send the highlight back to the AI row.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed off the query alone
  useEffect(() => setHighlightedIndex(0), [inputValue]);

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const { key } = e.nativeEvent;
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
    // Otherwise the caret jumps to the start/end of the query as you navigate.
    e.preventDefault();
    if (!canHighlight) return;
    // Step from activeIndex, not the raw state: if the list shrank under a
    // stale index, ArrowUp would otherwise walk back through dead indices.
    setHighlightedIndex(
      key === 'ArrowDown'
        ? Math.min(activeIndex + 1, rows.length - 1)
        : Math.max(activeIndex - 1, 0),
    );
  };

  // Enter runs whatever is highlighted — the AI row unless you've arrowed off
  // it. With an empty query there's nothing highlighted, so it clears instead.
  const submit = () => {
    if (canHighlight) {
      rows[activeIndex]?.run();
      return;
    }
    if (inputValue) {
      selectContent();
      return;
    }
    onChange('');
    onCommit();
  };

  const renderRecent = (entry: RecentSearch) => (
    <Animated.View
      key={`${entry.kind}:${entry.value}`}
      style={styles.recentRow}
      entering={FadeIn.duration(theme.motion.base)}
      exiting={FadeOut.duration(theme.motion.fast)}
    >
      <Pressable
        onPress={() => selectRecent(entry)}
        style={({ pressed }) => [
          styles.option,
          styles.recentOption,
          {
            backgroundColor:
              pressed || isHighlighted(`recent:${entry.kind}:${entry.value}`)
                ? palette.surfaceElevated
                : 'transparent',
            borderLeftColor: isHighlighted(
              `recent:${entry.kind}:${entry.value}`,
            )
              ? palette.primary
              : 'transparent',
          },
        ]}
      >
        <MaterialIcons
          name={RECENT_KIND_ICON[entry.kind]}
          size={14}
          color={palette.textSecondary}
        />
        <Text
          style={[styles.optionText, { color: palette.textPrimary }]}
          numberOfLines={1}
        >
          {entry.value}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => removeRecentSearch(entry)}
        accessibilityLabel={`Remove recent search ${entry.value}`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.removeRecent,
          { opacity: pressed ? 0.4 : 0.7 },
        ]}
      >
        <MaterialIcons name="close" size={14} color={palette.textSecondary} />
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.divider,
          },
        ]}
      >
        <MaterialIcons name="search" size={20} color={palette.textSecondary} />
        <TextInput
          ref={inputRef}
          value={inputValue}
          onChangeText={setInputValue}
          onSubmitEditing={submit}
          onKeyPress={onKeyPress}
          placeholder="Search…"
          placeholderTextColor={palette.textSecondary}
          style={[styles.input, { color: palette.textPrimary }]}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator size="small" color={palette.textSecondary} />
        ) : null}
        {inputValue ? (
          <Pressable
            onPress={clear}
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={styles.inputButton}
          >
            <MaterialIcons
              name="close"
              size={20}
              color={palette.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: palette.surface }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {inputValue.length > 0 ? (
          <Pressable
            onPress={selectContent}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor:
                  pressed || isHighlighted('__ai')
                    ? palette.surfaceElevated
                    : 'transparent',
                borderLeftColor: isHighlighted('__ai')
                  ? palette.primary
                  : 'transparent',
              },
            ]}
          >
            <MaterialIcons
              name="auto-awesome"
              size={14}
              color={palette.textSecondary}
            />
            <Text
              style={[styles.optionText, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              AI search: {inputValue}
            </Text>
          </Pressable>
        ) : null}

        {hasRecentsToShow ? (
          <View>
            <View
              style={[
                styles.groupHeaderRow,
                { backgroundColor: palette.surfaceElevated },
              ]}
            >
              <Text
                style={[styles.groupHeader, { color: palette.textSecondary }]}
              >
                RECENT
              </Text>
              <Pressable
                onPress={clearRecentSearches}
                accessibilityLabel="Clear recent searches"
                style={({ pressed }) => [
                  styles.clearRecents,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.clearRecentsText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Clear
                </Text>
              </Pressable>
            </View>
            {pinnedRecents.map(renderRecent)}
            {overflowRecents.length > 0 ? (
              <Collapsible
                expanded={showAllRecents}
                duration={theme.motion.base}
              >
                {overflowRecents.map(renderRecent)}
              </Collapsible>
            ) : null}
            {canToggleRecents ? (
              <Pressable
                onPress={() => setShowAllRecents((v) => !v)}
                accessibilityLabel={
                  showAllRecents
                    ? 'Show fewer recent searches'
                    : 'Show more recent searches'
                }
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: pressed
                      ? palette.surfaceElevated
                      : 'transparent',
                  },
                ]}
              >
                <MaterialIcons
                  name={showAllRecents ? 'expand-less' : 'expand-more'}
                  size={14}
                  color={palette.textSecondary}
                />
                <Text
                  style={[styles.optionText, { color: palette.textSecondary }]}
                  numberOfLines={1}
                >
                  {showAllRecents
                    ? 'Show fewer'
                    : `Show ${hiddenRecentCount} more`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {hasGroupedToShow
          ? groupedOptions.map((group) => (
              <View key={group.title}>
                <Text
                  style={[
                    styles.groupHeader,
                    {
                      color: palette.textSecondary,
                      backgroundColor: palette.surfaceElevated,
                    },
                  ]}
                >
                  {group.title.toUpperCase()}
                </Text>
                {group.options.map((opt) => (
                  <SuggestionRow
                    key={`${group.title}:${opt}`}
                    suggestion={{ value: opt, kind: group.kind }}
                    onPress={selectSuggestion}
                    palette={palette}
                    highlighted={isHighlighted(`${group.title}:${opt}`)}
                  />
                ))}
              </View>
            ))
          : null}

        {hasOptionsToShow
          ? options.map((opt) => (
              <SuggestionRow
                key={`${opt.kind}:${opt.value}`}
                suggestion={opt}
                onPress={selectSuggestion}
                palette={palette}
                highlighted={isHighlighted(`${opt.kind}:${opt.value}`)}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

function SuggestionRow({
  suggestion,
  onPress,
  palette,
  highlighted,
}: {
  suggestion: Suggestion;
  onPress: (s: Suggestion) => void;
  palette: Palette;
  highlighted: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(suggestion)}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor:
            pressed || highlighted ? palette.surfaceElevated : 'transparent',
          borderLeftColor: highlighted ? palette.primary : 'transparent',
        },
      ]}
    >
      <MaterialIcons
        name={KIND_ICON[suggestion.kind]}
        size={14}
        color={palette.textSecondary}
      />
      <Text
        style={[styles.optionText, { color: palette.textPrimary }]}
        numberOfLines={1}
      >
        {suggestion.value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.MEDIUM,
    paddingVertical: SPACING.TINY,
  },
  inputButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    minHeight: 28,
    // Always reserve the accent gutter so highlighting a row doesn't shift its
    // text sideways. The palette is grayscale, so a background tint alone is
    // too faint to read as "selected" — the bar carries it.
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  optionText: {
    fontSize: FONT_SIZES.SMALL,
    flex: 1,
  },
  groupHeader: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    letterSpacing: 0.5,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: SPACING.SMALL,
  },
  clearRecents: {
    paddingVertical: SPACING.TINY,
    paddingHorizontal: SPACING.TINY,
  },
  clearRecentsText: {
    fontSize: FONT_SIZES.TINY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  recentOption: {
    flex: 1,
  },
  removeRecent: {
    paddingHorizontal: SPACING.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
