import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import type { Photo } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import { groupPhotosBySort } from '../utils/groupPhotos';
import PhotoCard from './PhotoCard';
import { Tooltip } from './Tooltip';

interface PhotoGridProps {
  photos: Photo[];
  loading: boolean;
  hasMore: boolean;
  columnCount: number;
  sortBy: string | undefined;
  onLoadMore: () => void;
  onPhotoPress: (photo: Photo) => void;
  onColumnCountChange?: (count: number) => void;
}

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;
const PINCH_STEP_OUT = 1.35; // pinch open >35% → fewer columns
const PINCH_STEP_IN = 0.74; // pinch close <26% → more columns

type Row =
  | {
      type: 'header';
      key: string;
      sectionKey: string;
      label: string;
      collapsed: boolean;
    }
  | { type: 'row'; key: string; photos: Photo[] };

function buildRows(
  photos: Photo[],
  sortBy: string | undefined,
  columns: number,
  collapsed: Set<string>,
): Row[] {
  // No sort/grouping (e.g. AI content search results) → flat grid of chunks.
  if (!sortBy) {
    const rows: Row[] = [];
    for (let i = 0; i < photos.length; i += columns) {
      const chunk = photos.slice(i, i + columns);
      rows.push({
        type: 'row',
        key: `r-${chunk[0].id}`,
        photos: chunk,
      });
    }
    return rows;
  }

  const sections = groupPhotosBySort(photos, sortBy);
  const rows: Row[] = [];
  for (const section of sections) {
    const isCollapsed = collapsed.has(section.key);
    rows.push({
      type: 'header',
      key: `h-${section.key}`,
      sectionKey: section.key,
      label: section.label,
      collapsed: isCollapsed,
    });
    if (isCollapsed) continue;
    for (let i = 0; i < section.photos.length; i += columns) {
      const chunk = section.photos.slice(i, i + columns);
      rows.push({
        type: 'row',
        key: `r-${section.key}-${chunk[0].id}`,
        photos: chunk,
      });
    }
  }
  return rows;
}

export default function PhotoGrid({
  photos,
  loading,
  hasMore,
  columnCount,
  sortBy,
  onLoadMore,
  onPhotoPress,
  onColumnCountChange,
}: PhotoGridProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const cellSize = Math.floor(width / columnCount);
  const isMobile = width < 600;

  const listRef = useRef<FlatList<Row>>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Section keys are sort-specific — clear state when the grouping changes.
  useEffect(() => {
    setCollapsed(new Set());
  }, [sortBy]);

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Discrete pinch-to-zoom: each gesture changes column count by at most one
  // step. Tracks whether the current gesture has already triggered a change
  // so a slow continuous pinch doesn't ratchet through every value.
  const columnCountRef = useRef(columnCount);
  columnCountRef.current = columnCount;
  const pinchAppliedRef = useRef(false);

  const applyPinchStep = useCallback(
    (direction: 'in' | 'out') => {
      if (!onColumnCountChange) return;
      if (pinchAppliedRef.current) return;
      const current = columnCountRef.current;
      const next =
        direction === 'out'
          ? Math.max(MIN_COLUMNS, current - 1)
          : Math.min(MAX_COLUMNS, current + 1);
      if (next === current) return;
      pinchAppliedRef.current = true;
      onColumnCountChange(next);
    },
    [onColumnCountChange],
  );

  const resetPinch = useCallback(() => {
    pinchAppliedRef.current = false;
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          runOnJS(resetPinch)();
        })
        .onUpdate((e) => {
          'worklet';
          if (e.scale >= PINCH_STEP_OUT) {
            runOnJS(applyPinchStep)('out');
          } else if (e.scale <= PINCH_STEP_IN) {
            runOnJS(applyPinchStep)('in');
          }
        })
        .onEnd(() => {
          'worklet';
          runOnJS(resetPinch)();
        }),
    [applyPinchStep, resetPinch],
  );

  const rows = useMemo(
    () => buildRows(photos, sortBy, columnCount, collapsed),
    [photos, sortBy, columnCount, collapsed],
  );

  const stickyIndices = useMemo(
    () =>
      rows.reduce<number[]>((acc, r, i) => {
        if (r.type === 'header') acc.push(i);
        return acc;
      }, []),
    [rows],
  );

  const renderItem: ListRenderItem<Row> = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return (
          <Pressable
            onPress={() => toggleCollapsed(item.sectionKey)}
            accessibilityRole="button"
            accessibilityLabel={`${
              item.collapsed ? 'Expand' : 'Collapse'
            } ${item.label}`}
            style={({ pressed }) => [
              styles.sectionHeader,
              {
                backgroundColor: palette.surface,
                borderBottomColor: palette.divider,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Tooltip
              title={item.collapsed ? 'Expand section' : 'Collapse section'}
            >
              <View style={styles.sectionIconButton}>
                <MaterialIcons
                  name={item.collapsed ? 'chevron-right' : 'expand-more'}
                  size={20}
                  color={palette.textPrimary}
                />
              </View>
            </Tooltip>
            <Text
              style={[styles.sectionHeaderText, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      }
      return (
        <View style={styles.row}>
          {item.photos.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              size={cellSize}
              onPress={onPhotoPress}
            />
          ))}
        </View>
      );
    },
    [cellSize, onPhotoPress, palette, toggleCollapsed],
  );

  const keyExtractor = useCallback((r: Row) => r.key, []);

  const list = (
    <FlatList
      ref={listRef}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      stickyHeaderIndices={stickyIndices}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={8}
      initialNumToRender={columnCount * 20}
      maxToRenderPerBatch={columnCount * 8}
      windowSize={21}
      onScrollToIndexFailed={(info) => {
        // FlatList hasn't measured the target yet — retry after a tick.
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
          });
        }, 50);
      }}
      style={{ flex: 1, backgroundColor: palette.background }}
      ListFooterComponent={
        loading ? (
          <View style={styles.footer}>
            <ActivityIndicator color={palette.textPrimary} />
          </View>
        ) : null
      }
    />
  );

  if (!isMobile || !onColumnCountChange) return list;
  return <GestureDetector gesture={pinchGesture}>{list}</GestureDetector>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    borderBottomWidth: 1,
    gap: SPACING.TINY,
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '600',
    minWidth: 0,
  },
  sectionIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: SPACING.MEDIUM,
    alignItems: 'center',
  },
});
