import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import Collapsible from './Collapsible';

interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Highlights the border when the section has an active filter. */
  active?: boolean;
  /** Slot rendered in the header after the title (e.g. an active-count badge). */
  badge?: ReactNode;
  /** Slot rendered at the far right of the header (e.g. an expand button). */
  action?: ReactNode;
  /** Slot rendered before the chevron (e.g. a drag handle). */
  leading?: ReactNode;
}

/**
 * The shared collapsible section frame used by every filter sidebar (gallery
 * and stats). Owns the container, header row, chevron toggle and animated body
 * so the two sidebars can never drift apart stylistically; callers supply only
 * the title, expand state and content (plus optional badge/action/leading).
 */
export default function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
  active = false,
  badge,
  action,
  leading,
}: CollapsibleSectionProps) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderColor: active ? palette.primary : palette.divider,
        },
      ]}
    >
      <View
        style={[
          styles.headerRow,
          {
            backgroundColor: palette.surfaceElevated,
            borderBottomColor: expanded ? palette.divider : 'transparent',
          },
        ]}
      >
        {leading}
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          style={({ pressed }) => [
            styles.headerToggle,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <MaterialIcons
            name={expanded ? 'expand-more' : 'chevron-right'}
            size={18}
            color={palette.textPrimary}
          />
          <Text
            style={[styles.headerTitle, { color: palette.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </Pressable>
        {badge}
        {action}
      </View>
      <Collapsible expanded={expanded}>
        <View style={styles.body}>{children}</View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
    gap: SPACING.TINY,
    borderBottomWidth: 1,
  },
  headerToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    paddingVertical: SPACING.TINY,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: FONT_SIZES.SMALL,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  body: {
    padding: SPACING.SMALL,
    gap: SPACING.SMALL,
  },
});
