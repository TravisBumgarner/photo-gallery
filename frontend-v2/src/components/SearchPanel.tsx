import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiFetch } from '../lib/api';
import {
  addRecentSearch,
  clearRecentSearches,
  type RecentSearch,
  removeRecentSearch,
  useRecentSearches,
} from '../lib/recentSearches';
import type { PhotoFilters } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

type SuggestionKind = 'file' | 'camera' | 'keyword' | 'person' | 'dog';

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
  onClose: () => void;
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
};

function appendToCommaList(current: string | undefined, value: string): string {
  const parts = new Set(
    (current ?? '').split(',').map((p) => p.trim()).filter(Boolean),
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
  onClose,
}: SearchPanelProps) {
  const palette = usePalette();
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [groupedOptions, setGroupedOptions] = useState<OptionGroup[]>([]);
  const [showGrouped, setShowGrouped] = useState(value.length === 0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const recents = useRecentSearches();

  // Autofocus the field as soon as the panel mounts.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Prime the grouped (browse-all) suggestions when there's no query yet.
  useEffect(() => {
    if (inputValue.length !== 0) return;
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
    // Only on mount — re-priming as the user types is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.kind === 'person') {
      onApplyFilter({
        people: appendToCommaList(peopleFilter, suggestion.value),
      });
      addRecentSearch({ value: suggestion.value, kind: 'person' });
      onChange('');
    } else if (suggestion.kind === 'dog') {
      onApplyFilter({ dogs: appendToCommaList(dogsFilter, suggestion.value) });
      addRecentSearch({ value: suggestion.value, kind: 'dog' });
      onChange('');
    } else {
      onChange(suggestion.value);
      addRecentSearch({ value: suggestion.value, kind: 'search' });
    }
    onClose();
  };

  const selectRecent = (entry: RecentSearch) => {
    if (entry.kind === 'person') {
      onApplyFilter({ people: appendToCommaList(peopleFilter, entry.value) });
      onChange('');
    } else if (entry.kind === 'dog') {
      onApplyFilter({ dogs: appendToCommaList(dogsFilter, entry.value) });
      onChange('');
    } else if (entry.kind === 'ai') {
      onContentSearch(entry.value);
    } else {
      onChange(entry.value);
    }
    // Promote this entry to the top of the list.
    addRecentSearch(entry);
    onClose();
  };

  const selectContent = () => {
    if (!inputValue) return;
    onContentSearch(inputValue);
    addRecentSearch({ value: inputValue, kind: 'ai' });
    onClose();
  };

  // Hitting Enter mirrors the highlighted dropdown row, which is always the AI
  // search option when the input has text. With empty input, fall through to a
  // regular (cleared) search submit.
  const submit = () => {
    if (inputValue) {
      onContentSearch(inputValue);
      addRecentSearch({ value: inputValue, kind: 'ai' });
    } else {
      onChange('');
    }
    onClose();
  };

  const clear = () => {
    setInputValue('');
    onChange('');
  };

  const hasGroupedToShow = showGrouped && groupedOptions.length > 0;
  const hasOptionsToShow = !showGrouped && options.length > 0;
  const hasRecentsToShow = showGrouped && recents.length > 0;

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
            style={[
              styles.option,
              styles.aiOption,
              { backgroundColor: palette.surfaceElevated },
            ]}
          >
            <MaterialIcons
              name="auto-awesome"
              size={16}
              color={palette.primary}
            />
            <Text
              style={[
                styles.optionText,
                { color: palette.primary, fontStyle: 'italic' },
              ]}
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
            {recents.map((entry) => (
              <View key={`${entry.kind}:${entry.value}`} style={styles.recentRow}>
                <Pressable
                  onPress={() => selectRecent(entry)}
                  style={({ pressed }) => [
                    styles.option,
                    styles.recentOption,
                    {
                      backgroundColor: pressed
                        ? palette.surfaceElevated
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
                  <MaterialIcons
                    name="close"
                    size={14}
                    color={palette.textSecondary}
                  />
                </Pressable>
              </View>
            ))}
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
}: {
  suggestion: Suggestion;
  onPress: (s: Suggestion) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <Pressable
      onPress={() => onPress(suggestion)}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: pressed ? palette.surfaceElevated : 'transparent' },
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
  },
  aiOption: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
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
