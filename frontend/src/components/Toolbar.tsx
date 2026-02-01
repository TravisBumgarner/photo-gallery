import {
  Add as AddIcon,
  FilterList as FilterListIcon,
  Folder as FolderIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import {
  Box,
  Breadcrumbs,
  IconButton,
  Link,
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

interface ToolbarProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
  columnCount: number;
  onColumnCountChange: (count: number) => void;
  onToggleFilters: () => void;
}

function Toolbar({
  filters,
  onFilterChange,
  columnCount,
  onColumnCountChange,
  onToggleFilters,
}: ToolbarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [folders, setFolders] = useState<string[]>([]);

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
        {/* Filter toggle button (mobile) */}
        {isMobile && (
          <IconButton size="small" onClick={onToggleFilters}>
            <FilterListIcon fontSize="small" />
          </IconButton>
        )}

        {/* Folder Browser */}
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
                renderValue={() => 'Select folder…'}
                sx={{
                  '& .MuiSelect-select': {
                    fontWeight: 'bold',
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

        {/* Row Count Control (hidden on mobile) */}
        {!isMobile && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
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
    </Box>
  );
}

export default Toolbar;
