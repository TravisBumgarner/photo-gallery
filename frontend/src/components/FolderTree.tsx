import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_SIZES, SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';
import Collapsible from './Collapsible';

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

function buildFolderTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const lookup = new Map<string, TreeNode>();
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  for (const path of sorted) {
    const segments = path.split('/').filter(Boolean);
    let parentList = root;
    let cumulative = '';
    for (const segment of segments) {
      cumulative = cumulative ? `${cumulative}/${segment}` : segment;
      let node = lookup.get(cumulative);
      if (!node) {
        node = { name: segment, path: cumulative, children: [] };
        lookup.set(cumulative, node);
        parentList.push(node);
      }
      parentList = node.children;
    }
  }
  return root;
}

interface FolderTreeProps {
  folders: string[];
  selected: string;
  onSelect: (folder: string) => void;
}

export default function FolderTree({
  folders,
  selected,
  onSelect,
}: FolderTreeProps) {
  const palette = usePalette();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (selected) {
      const segs = selected.split('/').filter(Boolean);
      for (let i = 0; i < segs.length; i++) {
        set.add(segs.slice(0, i + 1).join('/'));
      }
    }
    return set;
  });

  const tree = buildFolderTree(folders);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        for (const p of prev) {
          if (p === path || p.startsWith(`${path}/`)) next.delete(p);
        }
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <View>
      <FolderRow
        name="All folders"
        depth={0}
        selected={selected === ''}
        hasChildren={false}
        isExpanded={false}
        onToggleExpand={() => {}}
        onSelect={() => onSelect('')}
        palette={palette}
      />
      {tree.map((node) => (
        <FolderBranch
          key={node.path}
          node={node}
          depth={0}
          selected={selected}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          palette={palette}
        />
      ))}
    </View>
  );
}

function FolderBranch({
  node,
  depth,
  selected,
  expanded,
  onToggleExpand,
  onSelect,
  palette,
}: {
  node: TreeNode;
  depth: number;
  selected: string;
  expanded: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (folder: string) => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.path);
  return (
    <>
      <FolderRow
        name={node.name}
        depth={depth}
        selected={selected === node.path}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggleExpand={() => onToggleExpand(node.path)}
        onSelect={() => onSelect(node.path)}
        palette={palette}
      />
      {hasChildren ? (
        <Collapsible expanded={isExpanded}>
          {node.children.map((child) => (
            <FolderBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              palette={palette}
            />
          ))}
        </Collapsible>
      ) : null}
    </>
  );
}

function FolderRow({
  name,
  depth,
  selected,
  hasChildren,
  isExpanded,
  onToggleExpand,
  onSelect,
  palette,
}: {
  name: string;
  depth: number;
  selected: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View
      style={[
        styles.folderRow,
        {
          paddingLeft: SPACING.SMALL + depth * SPACING.MEDIUM,
          backgroundColor: selected
            ? palette.surfaceElevated
            : 'transparent',
        },
      ]}
    >
      {hasChildren ? (
        <Pressable
          onPress={onToggleExpand}
          accessibilityLabel={isExpanded ? 'Collapse folder' : 'Expand folder'}
          style={styles.folderChevron}
        >
          <MaterialIcons
            name={isExpanded ? 'expand-more' : 'chevron-right'}
            size={16}
            color={palette.textSecondary}
          />
        </Pressable>
      ) : (
        <View style={styles.folderChevron} />
      )}
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [
          styles.folderLabel,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons
          name={selected ? 'folder-open' : 'folder'}
          size={14}
          color={selected ? palette.primary : palette.textSecondary}
        />
        <Text
          style={[
            styles.folderText,
            {
              color: selected ? palette.primary : palette.textPrimary,
              fontWeight: selected ? '600' : 'normal',
            },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.TINY,
    gap: SPACING.TINY,
  },
  folderChevron: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.TINY,
    flex: 1,
    minWidth: 0,
  },
  folderText: {
    fontSize: FONT_SIZES.SMALL,
    flex: 1,
  },
});
