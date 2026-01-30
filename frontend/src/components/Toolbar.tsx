import {
  Add as AddIcon,
  Folder as FolderIcon,
  Logout as LogoutIcon,
  Remove as RemoveIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import {
  Box,
  Breadcrumbs,
  Chip,
  FormControl,
  IconButton,
  Link,
  MenuItem,
  Rating,
  Select,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { PhotoFilters } from '@/types';

interface ToolbarProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
  columnCount: number;
  onColumnCountChange: (count: number) => void;
  onLogout: () => void;
}

function Toolbar({
  filters,
  onFilterChange,
  columnCount,
  onColumnCountChange,
  onLogout,
}: ToolbarProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [isoValues, setIsoValues] = useState<number[]>([]);
  const [apertureValues, setApertureValues] = useState<number[]>([]);
  const [isoRange, setIsoRange] = useState<[number, number] | null>(null);
  const [apertureRange, setApertureRange] = useState<[number, number] | null>(
    null,
  );

  useEffect(() => {
    Promise.all([
      fetch('/api/photos/meta/folders', { credentials: 'include' }).then(
        (res) => res.json(),
      ),
      fetch('/api/photos/meta/iso-values', { credentials: 'include' }).then(
        (res) => res.json(),
      ),
      fetch('/api/photos/meta/aperture-values', {
        credentials: 'include',
      }).then((res) => res.json()),
    ])
      .then(([foldersData, isoData, apertureData]) => {
        setFolders(foldersData);
        setIsoValues(isoData);
        setApertureValues(apertureData);
      })
      .catch((err) => console.error('Failed to fetch toolbar metadata:', err));
  }, []);

  const currentFolder = filters.folder || '';
  const breadcrumbs = currentFolder ? currentFolder.split('/') : [];

  // For each breadcrumb depth, compute the sibling folders at that level
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

  // Children one level deeper than the current folder
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
        {/* Folder Browser */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <FolderIcon fontSize="small" color="action" />
          <Breadcrumbs
            separator="/"
            sx={{ '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}
          >
            <Link
              component="button"
              variant="body2"
              underline={currentFolder ? 'hover' : 'none'}
              color={currentFolder ? 'inherit' : 'primary'}
              fontWeight={currentFolder ? 'normal' : 'bold'}
              onClick={() => onFilterChange({ folder: '' })}
              sx={{ cursor: 'pointer' }}
            >
              All
            </Link>
            {breadcrumbs.map((segment, index) => {
              const siblings = siblingsAtDepth[index] || [];
              const parentPath = breadcrumbs.slice(0, index).join('/');
              if (siblings.length > 1) {
                return (
                  <Select
                    key={index}
                    value={segment}
                    variant="standard"
                    disableUnderline
                    onChange={(e) => {
                      const picked = e.target.value;
                      const newFolder = parentPath
                        ? `${parentPath}/${picked}`
                        : picked;
                      onFilterChange({ folder: newFolder });
                    }}
                    sx={{
                      '& .MuiSelect-select': {
                        py: 0,
                        typography: 'body2',
                        fontWeight: 'bold',
                      },
                    }}
                  >
                    {siblings.map((sib) => (
                      <MenuItem key={sib} value={sib}>
                        {sib}
                      </MenuItem>
                    ))}
                  </Select>
                );
              }
              return (
                <Typography
                  key={index}
                  variant="body2"
                  fontWeight="bold"
                  color="primary"
                >
                  {segment}
                </Typography>
              );
            })}
          </Breadcrumbs>
          {children.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value=""
                displayEmpty
                onChange={(e) => {
                  const child = e.target.value;
                  if (child) {
                    const newFolder = currentFolder
                      ? `${currentFolder}/${child}`
                      : child;
                    onFilterChange({ folder: newFolder });
                  }
                }}
                renderValue={() => (
                  <Typography variant="body2" color="text.secondary">
                    Select folder…
                  </Typography>
                )}
              >
                {children.map((child) => (
                  <MenuItem key={child} value={child}>
                    {child}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>

        {/* Right side controls */}
        <Stack direction="row" spacing={2} alignItems="center">
          {/* Sort By */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={filters.sortBy || 'dateCaptured'}
              onChange={(e) => onFilterChange({ sortBy: e.target.value })}
              displayEmpty
            >
              <MenuItem value="dateCaptured">Date Captured</MenuItem>
              <MenuItem value="createdAt">Date Added</MenuItem>
              <MenuItem value="filename">Filename</MenuItem>
              <MenuItem value="camera">Camera</MenuItem>
              <MenuItem value="iso">ISO</MenuItem>
              <MenuItem value="aperture">Aperture</MenuItem>
            </Select>
          </FormControl>

          {/* Order */}
          <Stack direction="row" spacing={0.5}>
            <Chip
              label="Desc"
              size="small"
              color={filters.sortOrder === 'desc' ? 'primary' : 'default'}
              onClick={() => onFilterChange({ sortOrder: 'desc' })}
              clickable
            />
            <Chip
              label="Asc"
              size="small"
              color={filters.sortOrder === 'asc' ? 'primary' : 'default'}
              onClick={() => onFilterChange({ sortOrder: 'asc' })}
              clickable
            />
          </Stack>

          {/* Column Controls */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.max(1, columnCount - 1))}
              disabled={columnCount <= 1}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              sx={{ minWidth: 16, textAlign: 'center' }}
            >
              {columnCount}
            </Typography>
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.min(8, columnCount + 1))}
              disabled={columnCount >= 8}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Logout */}
          <Tooltip title="Logout">
            <IconButton size="small" onClick={onLogout}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Second row: Color, Rating, ISO, Aperture */}
      <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1 }}>
        {/* Color Label */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" fontWeight="600" sx={{ mr: 0.5 }}>
            Color
          </Typography>
          <Box
            onClick={() => onFilterChange({ label: '' })}
            sx={{
              width: 20,
              height: 20,
              border: 2,
              borderColor: !filters.label ? 'primary.main' : 'divider',
              borderRadius: 0.5,
              cursor: 'pointer',
              bgcolor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.55rem',
              fontWeight: 'bold',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            All
          </Box>
          {['Red', 'Yellow', 'Green', 'Blue', 'Purple'].map((label) => {
            const labelColors: Record<string, string> = {
              Red: '#f44336',
              Yellow: '#ffeb3b',
              Green: '#4caf50',
              Blue: '#2196f3',
              Purple: '#9c27b0',
            };
            return (
              <Box
                key={label}
                onClick={() => onFilterChange({ label })}
                sx={{
                  width: 20,
                  height: 20,
                  bgcolor: labelColors[label],
                  border: 2,
                  borderColor:
                    filters.label === label ? 'black' : 'transparent',
                  borderRadius: 0.5,
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'black' },
                }}
              />
            );
          })}
        </Stack>

        {/* Rating */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" fontWeight="600" sx={{ mr: 0.5 }}>
            Rating
          </Typography>
          <Chip
            label="All"
            size="small"
            color={filters.rating === undefined ? 'primary' : 'default'}
            onClick={() => onFilterChange({ rating: undefined })}
            clickable
          />
          <Rating
            value={filters.rating || 0}
            onChange={(_, newValue) => {
              onFilterChange({
                rating: newValue === 0 ? undefined : newValue || undefined,
              });
            }}
            emptyIcon={<StarIcon style={{ opacity: 0.3 }} fontSize="inherit" />}
            size="small"
          />
        </Stack>

        {/* ISO Range */}
        {isoValues.length > 0 && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexGrow: 1 }}
          >
            <Typography variant="caption" fontWeight="600">
              ISO
            </Typography>
            <Slider
              value={
                isoRange || [
                  filters.minIso ?? Math.min(...isoValues),
                  filters.maxIso ?? Math.max(...isoValues),
                ]
              }
              onChange={(_, newValue) => {
                setIsoRange(newValue as [number, number]);
              }}
              onChangeCommitted={(_, newValue) => {
                const [min, max] = newValue as number[];
                const minIso = Math.min(...isoValues);
                const maxIso = Math.max(...isoValues);
                onFilterChange({
                  minIso: min === minIso ? undefined : min,
                  maxIso: max === maxIso ? undefined : max,
                });
                setIsoRange(null);
              }}
              min={Math.min(...isoValues)}
              max={Math.max(...isoValues)}
              valueLabelDisplay="auto"
              size="small"
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        )}

        {/* Aperture Range */}
        {apertureValues.length > 0 && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexGrow: 1 }}
          >
            <Typography variant="caption" fontWeight="600">
              Aperture
            </Typography>
            <Slider
              value={
                apertureRange || [
                  filters.minAperture ?? Math.min(...apertureValues),
                  filters.maxAperture ?? Math.max(...apertureValues),
                ]
              }
              onChange={(_, newValue) => {
                setApertureRange(newValue as [number, number]);
              }}
              onChangeCommitted={(_, newValue) => {
                const [min, max] = newValue as number[];
                const minAperture = Math.min(...apertureValues);
                const maxAperture = Math.max(...apertureValues);
                onFilterChange({
                  minAperture: min === minAperture ? undefined : min,
                  maxAperture: max === maxAperture ? undefined : max,
                });
                setApertureRange(null);
              }}
              min={Math.min(...apertureValues)}
              max={Math.max(...apertureValues)}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `f/${value}`}
              size="small"
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export default Toolbar;
