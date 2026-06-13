import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, imageUrl, thumbnailUrl } from '../lib/api';
import type { Photo } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import { Tooltip } from './Tooltip';

interface PhotoViewerProps {
  photo: Photo | null;
  photos: Photo[];
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSelectPhoto: (photo: Photo) => void;
}

const LABEL_COLORS: Record<string, string> = {
  Red: '#f44336',
  Yellow: '#ffeb3b',
  Green: '#4caf50',
  Blue: '#2196f3',
  Purple: '#9c27b0',
};

function formatAspectRatio(ratio: number | null | undefined): string {
  if (ratio == null) return 'N/A';
  const common = [
    { value: 1, label: '1:1' },
    { value: 1.5, label: '3:2' },
    { value: 0.67, label: '2:3' },
    { value: 1.78, label: '16:9' },
    { value: 0.56, label: '9:16' },
    { value: 1.33, label: '4:3' },
    { value: 0.75, label: '3:4' },
  ];
  for (const c of common) {
    if (Math.abs(ratio - c.value) < 0.05) return c.label;
  }
  return ratio.toFixed(2);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return 'N/A';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface NeighborsResponse {
  before: Photo[];
  after: Photo[];
}

export default function PhotoViewer({
  photo,
  photos,
  onClose,
  onNavigate,
  onSelectPhoto,
}: PhotoViewerProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [showMetadata, setShowMetadata] = useState(!isMobile);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [neighbors, setNeighbors] = useState<NeighborsResponse>({
    before: [],
    after: [],
  });

  const currentIndex = useMemo(
    () => (photo ? photos.findIndex((p) => p.id === photo.id) : -1),
    [photo, photos],
  );
  const inResults = currentIndex !== -1;

  const commitNav = useCallback(
    (direction: 'prev' | 'next') => {
      if (!photo) return;
      if (inResults) {
        onNavigate(direction);
        return;
      }
      const target =
        direction === 'prev'
          ? neighbors.before[neighbors.before.length - 1]
          : neighbors.after[0];
      if (target) onSelectPhoto(target);
    },
    [inResults, neighbors, onNavigate, onSelectPhoto, photo],
  );

  // Slide animation state. translateX is the live offset of the image;
  // a swipe (or button/keyboard nav) animates it off-screen, jumps it to the
  // opposite off-screen side, swaps the photo, then slides it back to 0.
  const [areaWidth, setAreaWidth] = useState(0);
  const translateX = useSharedValue(0);
  const isAnimatingRef = useRef(false);

  const releaseAnimating = useCallback(() => {
    isAnimatingRef.current = false;
  }, []);

  const animatedSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Fetch chronological neighbors
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    apiFetch(`/api/photos/${photo.id}/neighbors?window=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NeighborsResponse | null) => {
        if (cancelled || !data) return;
        setNeighbors({ before: data.before ?? [], after: data.after ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo]);

  // Progressive preload of adjacent images. When the photo is in the current
  // result set, walk that list. Otherwise use the chronological neighbors
  // fetched from the API so we still warm prev/next when arriving from search.
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!photo) return;
    const preload = (p: Photo | undefined) => {
      if (!p) return Promise.resolve();
      const src = imageUrl(p.originalPath);
      if (preloadedRef.current.has(src)) return Promise.resolve();
      preloadedRef.current.add(src);
      return Image.prefetch(src).catch(() => {});
    };

    let prev: Photo | undefined;
    let next: Photo | undefined;
    let prevPrev: Photo | undefined;
    let nextNext: Photo | undefined;

    if (inResults && photos.length > 1) {
      const at = (offset: number) => {
        const i = (currentIndex + offset + photos.length) % photos.length;
        return photos[i];
      };
      prev = at(-1);
      next = at(1);
      if (photos.length > 3) {
        prevPrev = at(-2);
        nextNext = at(2);
      }
    } else {
      prev = neighbors.before[neighbors.before.length - 1];
      next = neighbors.after[0];
      prevPrev = neighbors.before[neighbors.before.length - 2];
      nextNext = neighbors.after[1];
    }

    Promise.all([preload(prev), preload(next)]).then(() => {
      preload(prevPrev);
      preload(nextNext);
    });
  }, [photo, photos, currentIndex, inResults, neighbors]);

  const prevDisabled = inResults
    ? photos.length <= 1
    : neighbors.before.length === 0;
  const nextDisabled = inResults
    ? photos.length <= 1
    : neighbors.after.length === 0;

  const slideTo = useCallback(
    (direction: 'prev' | 'next') => {
      if (!photo) return;
      if (direction === 'next' && nextDisabled) return;
      if (direction === 'prev' && prevDisabled) return;
      if (areaWidth === 0) {
        commitNav(direction);
        return;
      }
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      const target = direction === 'next' ? -areaWidth : areaWidth;
      translateX.value = withTiming(target, { duration: 220 }, (finished) => {
        'worklet';
        if (finished) {
          // Jump off-screen to the opposite side, swap photo, slide back in.
          translateX.value = -target;
          runOnJS(commitNav)(direction);
          translateX.value = withTiming(0, { duration: 220 }, (done) => {
            'worklet';
            if (done) runOnJS(releaseAnimating)();
          });
        } else {
          runOnJS(releaseAnimating)();
        }
      });
    },
    [
      areaWidth,
      commitNav,
      nextDisabled,
      photo,
      prevDisabled,
      releaseAnimating,
      translateX,
    ],
  );

  // Keyboard nav on web. RN doesn't have a keydown event on native.
  useEffect(() => {
    if (Platform.OS !== 'web' || !photo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') slideTo('prev');
      else if (e.key === 'ArrowRight') slideTo('next');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [photo, onClose, slideTo]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onUpdate((e) => {
          'worklet';
          if (isAnimatingRef.current) return;
          translateX.value = e.translationX;
        })
        .onEnd((e) => {
          'worklet';
          if (areaWidth === 0) {
            translateX.value = withSpring(0);
            return;
          }
          const threshold = areaWidth * 0.22;
          const velocity = e.velocityX;
          const goNext =
            (e.translationX < -threshold || velocity < -800) && !nextDisabled;
          const goPrev =
            (e.translationX > threshold || velocity > 800) && !prevDisabled;
          if (!goNext && !goPrev) {
            translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
            return;
          }
          const direction: 'prev' | 'next' = goNext ? 'next' : 'prev';
          const target = goNext ? -areaWidth : areaWidth;
          isAnimatingRef.current = true;
          translateX.value = withTiming(
            target,
            { duration: 200 },
            (finished) => {
              'worklet';
              if (finished) {
                translateX.value = -target;
                runOnJS(commitNav)(direction);
                translateX.value = withTiming(
                  0,
                  { duration: 220 },
                  (done) => {
                    'worklet';
                    if (done) runOnJS(releaseAnimating)();
                  },
                );
              } else {
                runOnJS(releaseAnimating)();
              }
            },
          );
        }),
    [
      areaWidth,
      commitNav,
      nextDisabled,
      prevDisabled,
      releaseAnimating,
      translateX,
    ],
  );

  if (!photo) return null;

  const uri = imageUrl(photo.originalPath);
  const hasNeighbors =
    neighbors.before.length > 0 || neighbors.after.length > 0;

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <View
          style={[
            styles.layout,
            { flexDirection: isMobile ? 'column' : 'row' },
          ]}
        >
          {/* Image area */}
          <View
            style={[
              styles.imageArea,
              { backgroundColor: palette.background },
            ]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && w !== areaWidth) setAreaWidth(w);
            }}
          >
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={[StyleSheet.absoluteFill, animatedSlideStyle]}
              >
                <Image
                  source={{ uri }}
                  placeholder={
                    photo.blurhash
                      ? {
                          blurhash: photo.blurhash,
                          width: photo.width ?? undefined,
                          height: photo.height ?? undefined,
                        }
                      : undefined
                  }
                  placeholderContentFit="contain"
                  contentFit="contain"
                  transition={200}
                  style={StyleSheet.absoluteFill}
                  recyclingKey={String(photo.id)}
                />
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Neighbors strip */}
          {showNeighbors && hasNeighbors && (
            <NeighborsStrip
              photos={[
                ...neighbors.before.filter((p) => p.id !== photo.id),
                photo,
                ...neighbors.after.filter((p) => p.id !== photo.id),
              ]}
              activeId={photo.id}
              isMobile={isMobile}
              onSelect={(p) => onSelectPhoto(p)}
            />
          )}

          {/* Metadata panel */}
          {showMetadata && (
            <MetadataPanel photo={photo} isMobile={isMobile} />
          )}
        </View>

        {/* Bottom bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.divider,
            },
          ]}
        >
          <IconBtn
            name="close"
            onPress={onClose}
            palette={palette}
            title="Close (Esc)"
          />
          <View
            style={[styles.divider, { backgroundColor: palette.divider }]}
          />
          {!isMobile && (
            <>
              <IconBtn
                name="arrow-back"
                onPress={() => slideTo('prev')}
                disabled={prevDisabled}
                palette={palette}
                title="Previous photo (←)"
              />
              <IconBtn
                name="arrow-forward"
                onPress={() => slideTo('next')}
                disabled={nextDisabled}
                palette={palette}
                title="Next photo (→)"
              />
              <View
                style={[styles.divider, { backgroundColor: palette.divider }]}
              />
            </>
          )}
          <IconBtn
            name="view-carousel"
            onPress={() => setShowNeighbors((v) => !v)}
            disabled={!hasNeighbors}
            active={showNeighbors}
            palette={palette}
            title={showNeighbors ? 'Hide neighbors' : 'Show neighbors'}
          />
          <IconBtn
            name="info-outline"
            onPress={() => setShowMetadata((v) => !v)}
            active={showMetadata}
            palette={palette}
            title={showMetadata ? 'Hide metadata' : 'Show metadata'}
          />
        </View>
      </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function IconBtn({
  name,
  onPress,
  disabled,
  active,
  palette,
  title,
}: {
  name: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  palette: ReturnType<typeof usePalette>;
  title: string;
}) {
  const color = disabled
    ? palette.textSecondary
    : active
      ? palette.primary
      : palette.textPrimary;
  return (
    <Tooltip title={title}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.iconButton,
          { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name={name} size={24} color={color} />
      </Pressable>
    </Tooltip>
  );
}

function NeighborsStrip({
  photos,
  activeId,
  isMobile,
  onSelect,
}: {
  photos: Photo[];
  activeId: number;
  isMobile: boolean;
  onSelect: (p: Photo) => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        isMobile
          ? {
              height: 80,
              borderTopWidth: 1,
              borderTopColor: palette.divider,
            }
          : {
              width: 72,
              borderLeftWidth: 1,
              borderLeftColor: palette.divider,
            },
        { backgroundColor: palette.surface },
      ]}
    >
      <ScrollView
        horizontal={isMobile}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          isMobile
            ? styles.neighborsContentHorizontal
            : styles.neighborsContentVertical
        }
      >
        {photos.map((p) => {
        const active = p.id === activeId;
        const size = isMobile ? 56 : 64;
        return (
          <Pressable
            key={p.id}
            onPress={() => !active && onSelect(p)}
            style={[
              styles.neighborItem,
              {
                width: size,
                height: size,
                opacity: active ? 1 : 0.75,
                borderColor: active ? palette.primary : 'transparent',
              },
            ]}
          >
            <Image
              source={{ uri: thumbnailUrl(p.thumbnailPath) }}
              placeholder={p.blurhash ? { blurhash: p.blurhash } : undefined}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
              recyclingKey={`neighbor-${p.id}`}
            />
          </Pressable>
        );
      })}
      </ScrollView>
    </View>
  );
}

function joinParts(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((p) => p != null && p !== '')
    .map(String)
    .join(' · ');
}

function MetadataPanel({
  photo,
  isMobile,
}: {
  photo: Photo;
  isMobile: boolean;
}) {
  const palette = usePalette();
  const keywords = parseKeywords(photo.keywords);

  const settingsLine = joinParts(
    photo.iso ? `ISO ${photo.iso}` : null,
    photo.aperture ? `f/${photo.aperture}` : null,
    photo.shutterSpeed,
    photo.focalLength ? `${photo.focalLength}mm` : null,
  );
  const detailsLine = joinParts(
    photo.width && photo.height ? `${photo.width} × ${photo.height}` : null,
    formatAspectRatio(photo.aspectRatio),
    formatFileSize(photo.fileSize),
  );

  return (
    <View
      style={[
        isMobile
          ? {
              borderTopWidth: 1,
              borderTopColor: palette.divider,
            }
          : {
              width: 180,
              borderLeftWidth: 1,
              borderLeftColor: palette.divider,
            },
        { backgroundColor: palette.surface },
      ]}
    >
    <ScrollView
      contentContainerStyle={{
        padding: SPACING.MEDIUM,
        gap: SPACING.SMALL,
      }}
    >
      <Text
        style={[styles.filename, { color: palette.textPrimary }]}
        numberOfLines={1}
      >
        {photo.filename}
      </Text>

      {(photo.rating || (photo.label && LABEL_COLORS[photo.label])) && (
        <View style={styles.inlineRow}>
          {photo.rating ? (
            <StarRating rating={photo.rating} palette={palette} />
          ) : null}
          {photo.label && LABEL_COLORS[photo.label] ? (
            <LabelChip label={photo.label} />
          ) : null}
        </View>
      )}

      {photo.camera && (
        <Text
          style={[styles.value, { color: palette.textPrimary }]}
          numberOfLines={1}
        >
          {photo.camera}
        </Text>
      )}
      {photo.lens && (
        <Text
          style={[styles.value, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {photo.lens}
        </Text>
      )}

      {settingsLine.length > 0 && (
        <Text style={[styles.value, { color: palette.textPrimary }]}>
          {settingsLine}
        </Text>
      )}

      {detailsLine.length > 0 && (
        <Text style={[styles.value, { color: palette.textSecondary }]}>
          {detailsLine}
        </Text>
      )}

      {photo.dateCaptured && (
        <Text style={[styles.value, { color: palette.textSecondary }]}>
          {formatDate(photo.dateCaptured)}
        </Text>
      )}

      {keywords.length > 0 && (
        <View style={styles.chipRow}>
          {keywords.map((k, i) => (
            <KeywordChip key={i} label={k} palette={palette} />
          ))}
        </View>
      )}
    </ScrollView>
    </View>
  );
}

function StarRating({
  rating,
  palette,
}: {
  rating: number | null | undefined;
  palette: ReturnType<typeof usePalette>;
}) {
  if (!rating) {
    return (
      <Text style={[styles.value, { color: palette.textPrimary }]}>N/A</Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialIcons
          key={i}
          name={i <= rating ? 'star' : 'star-border'}
          size={18}
          color={i <= rating ? palette.primary : palette.textSecondary}
        />
      ))}
    </View>
  );
}

function LabelChip({ label }: { label: string | null | undefined }) {
  const palette = usePalette();
  if (!label || !LABEL_COLORS[label]) {
    return (
      <Text style={[styles.value, { color: palette.textPrimary }]}>N/A</Text>
    );
  }
  const bg = LABEL_COLORS[label];
  const fg = label === 'Yellow' ? '#000' : '#fff';
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function KeywordChip({
  label,
  palette,
}: {
  label: string;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: palette.surfaceElevated,
          borderWidth: 1,
          borderColor: palette.divider,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: palette.textPrimary }]}>
        {label}
      </Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  layout: { flex: 1 },
  imageArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    gap: SPACING.SMALL,
    borderTopWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: SPACING.SMALL,
  },
  neighborsScroll: {
    flexShrink: 0,
  },
  neighborsContentHorizontal: {
    padding: SPACING.TINY,
    gap: SPACING.TINY,
    flexDirection: 'row',
  },
  neighborsContentVertical: {
    padding: SPACING.TINY,
    gap: SPACING.TINY,
    flexDirection: 'column',
    alignItems: 'center',
  },
  neighborItem: {
    overflow: 'hidden',
    borderWidth: 2,
    position: 'relative',
  },
  metadataPanel: {
    flexShrink: 0,
  },
  filename: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: '600',
    marginBottom: SPACING.TINY,
  },
  value: {
    fontSize: FONT_SIZES.SMALL,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SMALL,
  },
  chip: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: FONT_SIZES.TINY,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.TINY,
  },
});
