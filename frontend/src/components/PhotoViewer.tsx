import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiFetch, imageUrl, thumbnailUrl } from '../lib/api';
import type { Photo } from '../lib/types';
import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import type { Palette } from '../styles/usePalette';
import { useTheme } from '../styles/useTheme';
import { useMountTransition } from './AnimatedDialog';
import { Tooltip } from './Tooltip';

/**
 * One slide takes this long. Navigation commits immediately and the slide
 * only plays catch-up, so this is purely aesthetic — it never gates input.
 */
const SLIDE_MS = 220;

/**
 * Photos want a dark stage in every theme, so the image backdrop stays
 * near-black instead of following the theme background. All surrounding
 * chrome (bars, panels, chips) is themed.
 */
const PHOTO_STAGE_BG = 'hsl(0, 0%, 5%)';

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
  const theme = useTheme();
  const palette = theme.colors;
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [showMetadata, setShowMetadata] = useState(false);
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

  // Slide animation state. The image area is a three-slot filmstrip —
  // [prev, current, next] — laid out side by side and translated as one track,
  // so the outgoing and incoming photos move together with no empty gap
  // between them. translateX is the track offset; it rests at -areaWidth,
  // which centres the middle (current) slot.
  const [areaWidth, setAreaWidth] = useState(0);
  const translateX = useSharedValue(0);
  const isAnimatingRef = useRef(false);
  // Set when a tap/key navigation commits, so the layout effect below knows to
  // start the incoming photo offset and settle it, rather than snapping.
  const settleFromRef = useRef<'prev' | 'next' | null>(null);

  const releaseAnimating = useCallback(() => {
    isAnimatingRef.current = false;
  }, []);

  const animatedSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Runs in the same commit as the shifted slots, whenever the photo changes
  // (or the area is first measured).
  //
  // Swipe path (settleFromRef empty): the gesture already animated the track
  // to the target, so re-centring to -W shows identical pixels — a no-op.
  //
  // Tap/key path (settleFromRef set): navigation commits the photo FIRST and
  // the slide plays catch-up. The slots have shifted one place, so keeping the
  // exact same pixels on screen means offsetting the track by one slot width
  // (+W for next, -W for prev) from wherever it currently is — mid-animation
  // included, which is what lets rapid taps chain with no jump — and then
  // settling to rest.
  useLayoutEffect(() => {
    const from = settleFromRef.current;
    settleFromRef.current = null;
    if (from && areaWidth > 0) {
      cancelAnimation(translateX);
      const shifted = translateX.value + (from === 'next' ? areaWidth : -areaWidth);
      // Clamp to the track's valid range in case of extreme chaining.
      translateX.value = Math.max(-areaWidth * 2, Math.min(0, shifted));
      isAnimatingRef.current = true;
      translateX.value = withTiming(
        -areaWidth,
        { duration: SLIDE_MS },
        (finished) => {
          'worklet';
          if (finished) runOnJS(releaseAnimating)();
        },
      );
      return;
    }
    translateX.value = -areaWidth;
    isAnimatingRef.current = false;
  }, [photo?.id, areaWidth, translateX, releaseAnimating]);

  // Fetch chronological neighbors. They drive prev/next only when the photo
  // isn't in the current result set, and the strip only when it's shown — so
  // skip the request entirely during plain grid navigation (it was firing on
  // every step and re-rendering the viewer mid-slide). Responses are cached
  // per photo for the viewer's lifetime.
  const photoId = photo?.id;
  const neighborsCacheRef = useRef<Map<number, NeighborsResponse>>(new Map());
  useEffect(() => {
    if (photoId == null) return;
    if (inResults && !showNeighbors) return;
    const cached = neighborsCacheRef.current.get(photoId);
    if (cached) {
      setNeighbors(cached);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/photos/${photoId}/neighbors?window=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NeighborsResponse | null) => {
        if (!data) return;
        const next = { before: data.before ?? [], after: data.after ?? [] };
        neighborsCacheRef.current.set(photoId, next);
        if (!cancelled) setNeighbors(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photoId, inResults, showNeighbors]);

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

  // The photos flanking the current one — the filmstrip's outer slots, and the
  // exact photos commitNav will move to. Undefined at either end of the list.
  const prevPhoto = inResults
    ? photos[currentIndex - 1]
    : neighbors.before[neighbors.before.length - 1];
  const nextPhoto = inResults ? photos[currentIndex + 1] : neighbors.after[0];

  // Derived from the neighbours themselves, so navigation is disabled exactly
  // when there's no slot to slide to.
  const prevDisabled = !prevPhoto;
  const nextDisabled = !nextPhoto;

  // Tap/key navigation: start the slide on this very frame (instant visual
  // response, no waiting on React) AND commit the photo immediately. When the
  // commit lands, the layout effect above shifts the track by one slot from
  // wherever the animation has reached — identical pixels — and settles, so
  // the two never disagree and rapid taps chain without blocking.
  const slideTo = useCallback(
    (direction: 'prev' | 'next') => {
      if (!photo) return;
      if (direction === 'next' && nextDisabled) return;
      if (direction === 'prev' && prevDisabled) return;
      if (areaWidth > 0) {
        isAnimatingRef.current = true;
        const target = direction === 'next' ? -areaWidth * 2 : 0;
        translateX.value = withTiming(target, { duration: SLIDE_MS });
      }
      settleFromRef.current = direction;
      commitNav(direction);
    },
    [areaWidth, commitNav, nextDisabled, photo, prevDisabled, translateX],
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
          // The track rests at -areaWidth, so drag from there rather than 0.
          translateX.value = -areaWidth + e.translationX;
        })
        .onEnd((e) => {
          'worklet';
          const rest = -areaWidth;
          if (areaWidth === 0) {
            translateX.value = withSpring(rest);
            return;
          }
          const threshold = areaWidth * 0.22;
          const velocity = e.velocityX;
          const goNext =
            (e.translationX < -threshold || velocity < -800) && !nextDisabled;
          const goPrev =
            (e.translationX > threshold || velocity > 800) && !prevDisabled;
          if (!goNext && !goPrev) {
            translateX.value = withSpring(rest, {
              damping: 18,
              stiffness: 220,
            });
            return;
          }
          const direction: 'prev' | 'next' = goNext ? 'next' : 'prev';
          const target = goNext ? -areaWidth * 2 : 0;
          isAnimatingRef.current = true;
          translateX.value = withTiming(
            target,
            { duration: SLIDE_MS },
            (finished) => {
              'worklet';
              if (finished) {
                runOnJS(commitNav)(direction);
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

  const hasNeighbors =
    neighbors.before.length > 0 || neighbors.after.length > 0;

  // Toggled chrome (neighbors strip, metadata panel) eases in and out with a
  // fade + small slide instead of popping. useMountTransition keeps each
  // mounted until its exit animation finishes.
  const neighborsTransition = useMountTransition(
    showNeighbors && hasNeighbors,
    theme.motion.base,
    theme.motion.fast,
  );
  const metadataTransition = useMountTransition(
    showMetadata,
    theme.motion.base,
    theme.motion.fast,
  );
  const neighborsProgress = neighborsTransition.progress;
  const metadataProgress = metadataTransition.progress;

  if (!photo) return null;

  // onLayout only reports after the first paint, so before it lands the middle
  // slot falls back to the full area — with the flanking slots at zero width it
  // is still correctly centred at translateX 0, and the first frame shows the
  // photo rather than a blank track.
  const slotWidth = (slot: number) =>
    slot === 1 ? areaWidth || '100%' : areaWidth;

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
                { backgroundColor: PHOTO_STAGE_BG },
              ]}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && w !== areaWidth) setAreaWidth(w);
              }}
            >
              <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.track, animatedSlideStyle]}>
                  {/* Keyed by photo id, not slot position: when the strip shifts,
                    React moves these nodes rather than remounting them, so the
                    incoming photo keeps the pixels it already decoded and
                    never flashes back to a placeholder. */}
                  {[prevPhoto, photo, nextPhoto].map((p, slot) =>
                    p ? (
                      <View
                        key={p.id}
                        style={[styles.slot, { width: slotWidth(slot) }]}
                      >
                        <Image
                          source={{ uri: imageUrl(p.originalPath) }}
                          // The grid thumbnail is already in cache — an
                          // instant, decode-free placeholder. (The old
                          // full-dimension blurhash decode stalled the JS
                          // thread for hundreds of ms per mount and never
                          // rendered on web anyway.)
                          placeholder={{ uri: thumbnailUrl(p.thumbnailPath) }}
                          placeholderContentFit="contain"
                          contentFit="contain"
                          transition={100}
                          style={StyleSheet.absoluteFill}
                          recyclingKey={String(p.id)}
                        />
                      </View>
                    ) : (
                      // Keeps the middle slot centred at either end of the list.
                      <View
                        key={`empty-${slot}`}
                        style={[styles.slot, { width: slotWidth(slot) }]}
                      />
                    ),
                  )}
                </Animated.View>
              </GestureDetector>
            </View>

            {/* Neighbors strip. Keyed by breakpoint: the collapse animation
                drives height on mobile but width on desktop, and a resize
                across the breakpoint would leave the old mode's dimension
                stuck on the node — remounting resets it. */}
            {neighborsTransition.mounted && hasNeighbors && (
              <NeighborsStrip
                key={isMobile ? 'neighbors-mobile' : 'neighbors-desktop'}
                photos={[
                  ...neighbors.before.filter((p) => p.id !== photo.id),
                  photo,
                  ...neighbors.after.filter((p) => p.id !== photo.id),
                ]}
                activeId={photo.id}
                isMobile={isMobile}
                onSelect={(p) => onSelectPhoto(p)}
                progress={neighborsProgress}
              />
            )}

            {/* Metadata panel — same breakpoint keying as the strip. */}
            {metadataTransition.mounted && (
              <MetadataPanel
                key={isMobile ? 'metadata-mobile' : 'metadata-desktop'}
                photo={photo}
                isMobile={isMobile}
                progress={metadataProgress}
              />
            )}
          </View>

          {/* Bottom bar: flush and in-flow — floating overlapped the mobile
              neighbors/metadata panels, which live at the bottom too. */}
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: palette.surface,
                borderTopWidth: theme.hairline,
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
            {/* Always enabled: neighbors are fetched lazily when the strip is
                first shown, so gating on data-already-loaded would deadlock. */}
            <IconBtn
              name="view-carousel"
              onPress={() => setShowNeighbors((v) => !v)}
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
  palette: Palette;
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

const NEIGHBORS_STRIP_WIDTH = 72;
const NEIGHBORS_STRIP_HEIGHT = 80;

function NeighborsStrip({
  photos,
  activeId,
  isMobile,
  onSelect,
  progress,
}: {
  photos: Photo[];
  activeId: number;
  isMobile: boolean;
  onSelect: (p: Photo) => void;
  /** Mount transition progress: collapses the strip's layout size, so the
   *  photo area resizes smoothly instead of jumping. */
  progress: SharedValue<number>;
}) {
  const theme = useTheme();
  const palette = theme.colors;
  const collapseStyle = useAnimatedStyle(() =>
    isMobile
      ? {
          height: progress.value * NEIGHBORS_STRIP_HEIGHT,
          opacity: progress.value,
        }
      : {
          width: progress.value * NEIGHBORS_STRIP_WIDTH,
          opacity: progress.value,
        },
  );
  return (
    <Animated.View
      style={[
        { overflow: 'hidden', backgroundColor: palette.surface },
        isMobile
          ? {
              borderTopWidth: theme.hairline,
              borderTopColor: palette.divider,
            }
          : {
              borderLeftWidth: theme.hairline,
              borderLeftColor: palette.divider,
            },
        collapseStyle,
      ]}
    >
      <View
        style={
          isMobile
            ? { height: NEIGHBORS_STRIP_HEIGHT }
            : { width: NEIGHBORS_STRIP_WIDTH, flex: 1 }
        }
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
    </Animated.View>
  );
}

function joinParts(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((p) => p != null && p !== '')
    .map(String)
    .join(' · ');
}

const METADATA_PANEL_WIDTH = 180;
/** Mobile metadata sheet grows to its content but never above this; taller
 *  content scrolls inside. */
const METADATA_MAX_HEIGHT_MOBILE = 280;

function MetadataPanel({
  photo,
  isMobile,
  progress,
}: {
  photo: Photo;
  isMobile: boolean;
  /** Mount transition progress: collapses the panel's layout size, so the
   *  photo area resizes smoothly instead of jumping. */
  progress: SharedValue<number>;
}) {
  const theme = useTheme();
  const palette = theme.colors;
  const keywords = parseKeywords(photo.keywords);
  // Mobile has no fixed panel size — measure the content and animate to it.
  const contentHeight = useSharedValue(0);
  const collapseStyle = useAnimatedStyle(() =>
    isMobile
      ? {
          height:
            Math.min(contentHeight.value, METADATA_MAX_HEIGHT_MOBILE) *
            progress.value,
          opacity: progress.value,
        }
      : {
          width: progress.value * METADATA_PANEL_WIDTH,
          opacity: progress.value,
        },
  );

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
    <Animated.View
      style={[
        { overflow: 'hidden', backgroundColor: palette.surface },
        isMobile
          ? {
              borderTopWidth: theme.hairline,
              borderTopColor: palette.divider,
            }
          : {
              borderLeftWidth: theme.hairline,
              borderLeftColor: palette.divider,
            },
        collapseStyle,
      ]}
    >
      <View
        style={
          isMobile ? undefined : { width: METADATA_PANEL_WIDTH, flex: 1 }
        }
      >
        <ScrollView>
          <View
            style={{ padding: SPACING.MEDIUM, gap: SPACING.SMALL }}
            onLayout={(e) => {
              contentHeight.value = e.nativeEvent.layout.height;
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
              <KeywordChip key={i} label={k} />
            ))}
          </View>
        )}
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}

function StarRating({
  rating,
  palette,
}: {
  rating: number | null | undefined;
  palette: Palette;
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
  const theme = useTheme();
  const palette = theme.colors;
  if (!label || !LABEL_COLORS[label]) {
    return (
      <Text style={[styles.value, { color: palette.textPrimary }]}>N/A</Text>
    );
  }
  const bg = LABEL_COLORS[label];
  const fg = label === 'Yellow' ? '#000' : '#fff';
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg, borderRadius: theme.radius.chip },
      ]}
    >
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function KeywordChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, theme.surfaces.chip]}>
      <Text style={[styles.chipText, { color: theme.colors.textPrimary }]}>
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
  track: {
    flexDirection: 'row',
    height: '100%',
  },
  slot: {
    height: '100%',
    position: 'relative',
    // The track is only as wide as the visible area while holding three slots,
    // so the slots must keep their width and overflow (imageArea clips them)
    // rather than being squeezed to a third each.
    flexShrink: 0,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    gap: SPACING.SMALL,
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
    // RN defaults flexShrink to 0, so without these a long tag pushes its chip
    // past the panel edge instead of wrapping. Bounding the chip's width is
    // what lets the Text inside wrap.
    flexShrink: 1,
    maxWidth: '100%',
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
