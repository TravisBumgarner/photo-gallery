import {
  Add as AddIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import {
  Box,
  Breadcrumbs,
  Button,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { PhotoFilters } from '@/types';
import { SPACING } from '@/styles/styleConsts';

interface FolderTreeLevelProps {
  parentPath: string;
  folders: string[];
  currentFolder: string;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (folder: string) => void;
  getChildrenAt: (parentPath: string) => string[];
  depth: number;
}

function FolderTreeLevel({
  parentPath,
  folders,
  currentFolder,
  expandedPaths,
  onToggleExpand,
  onSelect,
  getChildrenAt,
  depth,
}: FolderTreeLevelProps) {
  const items = getChildrenAt(parentPath);

  return (
    <>
      {items.map((name) => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        const subChildren = getChildrenAt(fullPath);
        const hasChildren = subChildren.length > 0;
        const isExpanded = expandedPaths.has(fullPath);
        const isSelected = currentFolder === fullPath;

        return (
          <Box key={name}>
            <ListItemButton
              onClick={() => onSelect(fullPath)}
              selected={isSelected}
              sx={{ py: 1.5, pl: 2 + depth * 3 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {isExpanded ? (
                  <FolderOpenIcon fontSize="small" />
                ) : (
                  <FolderIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={name}
                primaryTypographyProps={{
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
              />
              {isSelected && <CheckIcon fontSize="small" color="primary" />}
              {hasChildren && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(fullPath);
                  }}
                  sx={{ ml: 1 }}
                >
                  <ChevronRightIcon
                    fontSize="small"
                    sx={{
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}
                  />
                </IconButton>
              )}
            </ListItemButton>
            {hasChildren && (
              <Collapse in={isExpanded}>
                <FolderTreeLevel
                  parentPath={fullPath}
                  folders={folders}
                  currentFolder={currentFolder}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                  onSelect={onSelect}
                  getChildrenAt={getChildrenAt}
                  depth={depth + 1}
                />
              </Collapse>
            )}
          </Box>
        );
      })}
    </>
  );
}

interface ToolbarProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
  columnCount: number;
  onColumnCountChange: (count: number) => void;
}

function Toolbar({
  filters,
  onFilterChange,
  columnCount,
  onColumnCountChange,
}: ToolbarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [folders, setFolders] = useState<string[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/photos/meta', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setFolders(data.folders || []);
      })
      .catch((err) => console.error('Failed to fetch toolbar metadata:', err));
  }, []);

  const currentFolder = filters.folder || '';
  const breadcrumbs = currentFolder ? currentFolder.split('/') : [];

  const siblingsAtDepth = useMemo(() => {
    return breadcrumbs.map((_, index) => {
      const parentPath = breadcrumbs.slice(0, index).join('/');
      const parentPrefix = parentPath ? `${parentPath}/` : '';
      const siblingSet = new Set<string>();
      folders.forEach((path) => {
        if (parentPrefix ? path.startsWith(parentPrefix) : true) {
          const segments = path.split('/');
          if (segments.length > index) {
            siblingSet.add(segments[index]);
          }
        }
      });
      return Array.from(siblingSet).sort((a, b) => a.localeCompare(b));
    });
  }, [folders, breadcrumbs]);

  const children = useMemo(() => {
    const depth = breadcrumbs.length;
    const prefix = currentFolder ? `${currentFolder}/` : '';
    const childSet = new Set<string>();
    folders.forEach((path) => {
      if (prefix ? path.startsWith(prefix) : true) {
        const segments = path.split('/');
        if (segments.length > depth) {
          childSet.add(segments[depth]);
        }
      }
    });
    return Array.from(childSet).sort((a, b) => a.localeCompare(b));
  }, [folders, currentFolder, breadcrumbs.length]);

  const getChildrenAt = (parentPath: string) => {
    const depth = parentPath ? parentPath.split('/').length : 0;
    const prefix = parentPath ? `${parentPath}/` : '';
    const childSet = new Set<string>();
    folders.forEach((path) => {
      if (prefix ? path.startsWith(prefix) : true) {
        const segments = path.split('/');
        if (segments.length > depth) {
          childSet.add(segments[depth]);
        }
      }
    });
    return Array.from(childSet).sort((a, b) => a.localeCompare(b));
  };

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Collapse this and all children
        for (const p of prev) {
          if (p === path || p.startsWith(path + '/')) {
            next.delete(p);
          }
        }
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleOpenFolderModal = () => {
    // Pre-expand the path to the currently selected folder
    const expanded = new Set<string>();
    if (currentFolder) {
      const segments = currentFolder.split('/');
      for (let i = 0; i < segments.length; i++) {
        expanded.add(segments.slice(0, i + 1).join('/'));
      }
    }
    setExpandedPaths(expanded);
    setFolderModalOpen(true);
  };

  const handleSelectFolder = (folder: string) => {
    onFilterChange({ folder });
    setFolderModalOpen(false);
  };

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        p: 1,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* Folder Browser — mobile: compact button, desktop: breadcrumbs */}
        {isMobile ? (
          <Button
            variant="text"
            startIcon={<FolderIcon />}
            onClick={handleOpenFolderModal}
            sx={{
              flex: 1,
              justifyContent: 'flex-start',
              textTransform: 'none',
              color: 'text.primary',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="body2"
              fontWeight="bold"
              noWrap
            >
              Browse
            </Typography>
          </Button>
        ) : (
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}
          >
            <FolderIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
            <Breadcrumbs
              separator="/"
              sx={{
                '& .MuiBreadcrumbs-separator': { mx: SPACING.SMALL.PX },
                '& .MuiBreadcrumbs-ol': { alignItems: 'center' },
                '& .MuiBreadcrumbs-li': { lineHeight: 1 },
              }}
            >
              <Link
                component="button"
                variant="body2"
                underline={currentFolder ? 'hover' : 'none'}
                color={currentFolder ? 'inherit' : 'primary'}
                fontWeight={currentFolder ? 'normal' : 'bold'}
                onClick={() => onFilterChange({ folder: '' })}
                sx={{ cursor: 'pointer', lineHeight: 1, fontSize: '13.33px', position: 'relative', fontWeight: 'bold', top: '-1px' }}
              >
                All
              </Link>
              {breadcrumbs.map((segment, index) => {
                const siblings = siblingsAtDepth[index] || [];
                const parentPath = breadcrumbs.slice(0, index).join('/');
                return (
                  <Select
                    key={index}
                    value={segment}
                    onChange={(e) => {
                      const picked = e.target.value as string;
                      if (picked === '__close__') {
                        const closeTo = breadcrumbs.slice(0, index).join('/');
                        onFilterChange({ folder: closeTo });
                      } else {
                        const newFolder = parentPath
                          ? `${parentPath}/${picked}`
                          : picked;
                        onFilterChange({ folder: newFolder });
                      }
                    }}
                    sx={{
                      '& .MuiSelect-select': {
                        fontWeight: 'bold',
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: { maxHeight: 300 },
                      },
                    }}
                  >
                    <MenuItem value="__close__" sx={{ fontStyle: 'italic' }}>
                      Close Folder
                    </MenuItem>
                    {siblings.map((sib) => (
                      <MenuItem key={sib} value={sib}>
                        {sib}
                      </MenuItem>
                    ))}
                  </Select>
                );
              })}
              {children.length > 0 && (
                <Select
                  value=""
                  displayEmpty
                  onChange={(e) => {
                    const child = e.target.value as string;
                    if (!child) return;
                    const newFolder = currentFolder
                      ? `${currentFolder}/${child}`
                      : child;
                    onFilterChange({ folder: newFolder });
                  }}
                  renderValue={() => 'Select folder\u2026'}
                  sx={{
                    '& .MuiSelect-select': {
                      fontWeight: 'bold',
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: { maxHeight: 300 },
                    },
                  }}
                >
                  {children.map((child) => (
                    <MenuItem key={child} value={child}>
                      {child}
                    </MenuItem>
                  ))}
                </Select>
              )}
            </Breadcrumbs>
          </Stack>
        )}

        {/* Row Count Control (hidden on mobile) */}
        {!isMobile && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{
            flexShrink: 0,
            paddingRight: '50px',
          }}>
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.max(1, columnCount - 1))}
              disabled={columnCount <= 1}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              sx={{ minWidth: 48, textAlign: 'center' }}
            >
              {columnCount} {columnCount === 1 ? 'Column' : 'Columns'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.min(8, columnCount + 1))}
              disabled={columnCount >= 8}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
      </Stack>

      {/* Mobile Folder Explorer Modal */}
      <Dialog
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        fullScreen
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography variant="h6" fontWeight="bold">Browse Folders</Typography>
          <IconButton onClick={() => setFolderModalOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {/* All Folders option */}
          <ListItemButton
            selected={!currentFolder}
            onClick={() => handleSelectFolder('')}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <FolderOpenIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="All Folders" primaryTypographyProps={{ fontWeight: !currentFolder ? 'bold' : 'normal' }} />
          </ListItemButton>

          {/* Recursive folder tree */}
          <FolderTreeLevel
            parentPath=""
            folders={folders}
            currentFolder={currentFolder}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpanded}
            onSelect={handleSelectFolder}
            getChildrenAt={getChildrenAt}
            depth={0}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default Toolbar;
