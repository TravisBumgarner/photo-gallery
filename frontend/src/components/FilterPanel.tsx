import {
  CalendarMonth as CalendarMonthIcon,
  Check as CheckIcon,
  ChevronLeft as ChevronLeftIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Logout as LogoutIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Rating,
  Select,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { memo, useEffect, useState } from 'react';
import SearchBar from '@/components/SearchBar';
import type { PhotoFilters } from '@/types';

interface FilterPanelProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
  onClose: () => void;
  onLogout: () => void;
}

const sectionSx = {
  bgcolor: 'action.hover',
  p: 0.75,
};

const aspectRatioOptions = [
  { label: '1x1', value: '1' },
  { label: '2x3', value: '0.67' },
  { label: '4x5', value: '0.8' },
  { label: '5x7', value: '0.71' },
  { label: '9x16', value: '0.56' },
];

const orientationOptions = [
  { label: 'Landscape', value: 'landscape' },
  { label: 'Portrait', value: 'portrait' },
  { label: 'Square', value: 'square' },
];

type AccordionSection =
  | 'general'
  | 'camera'
  | 'lens'
  | 'aspectRatio'
  | 'dates'
  | 'tags';

function toggleInList(current: string | undefined, value: string): string {
  const items = current ? current.split(',').filter(Boolean) : [];
  const index = items.indexOf(value);
  if (index >= 0) {
    items.splice(index, 1);
  } else {
    items.push(value);
  }
  return items.join(',');
}

function isInList(current: string | undefined, value: string): boolean {
  if (!current) return false;
  return current.split(',').includes(value);
}

function SectionHeader({
  label,
  section,
  expandedSection,
  onToggle,
  hasActiveFilter,
  onClear,
}: {
  label: string;
  section: AccordionSection;
  expandedSection: AccordionSection | null;
  onToggle: (section: AccordionSection) => void;
  hasActiveFilter: boolean;
  onClear: () => void;
}) {
  const isExpanded = expandedSection === section;
  return (
    <Box
      onClick={() => onToggle(section)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: { xs: 1.5, sm: 0.5 },
        px: { xs: 1, sm: 0.25 },
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        borderRadius: 0.5,
      }}
    >
      <Typography variant="caption" fontWeight="600">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {hasActiveFilter && (
          <Typography
            variant="caption"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            sx={{
              cursor: 'pointer',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
              fontSize: '0.65rem',
            }}
          >
            Clear
          </Typography>
        )}
        {isExpanded ? (
          <ExpandLessIcon sx={{ fontSize: 16 }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        )}
      </Stack>
    </Box>
  );
}

const FilterPanel = memo(function FilterPanel({
  filters,
  onFilterChange,
  onClose,
  onLogout,
}: FilterPanelProps) {
  const [cameras, setCameras] = useState<string[]>([]);
  const [lenses, setLenses] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [dateCounts, setDateCounts] = useState<Record<string, number>>({});
  const [keywords, setKeywords] = useState<string[]>([]);
  const [isoValues, setIsoValues] = useState<number[]>([]);
  const [apertureValues, setApertureValues] = useState<number[]>([]);
  const [isoRange, setIsoRange] = useState<[number, number] | null>(null);
  const [apertureRange, setApertureRange] = useState<[number, number] | null>(
    null,
  );
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] =
    useState<AccordionSection | null>(null);

  useEffect(() => {
    fetch('/api/photos/meta', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setCameras(data.cameras || []);
        setLenses(data.lenses || []);
        setDates(data.dates || []);
        setDateCounts(data.dateCounts || {});
        setKeywords(data.keywords || []);
        setIsoValues(data.isoValues || []);
        setApertureValues(data.apertureValues || []);
      })
      .catch((err) => console.error('Failed to fetch metadata:', err));
  }, []);

  const toggleSection = (section: AccordionSection) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  // Compute active filter state per section
  const hasGeneralFilter = !!(
    filters.label ||
    filters.rating !== undefined ||
    filters.minIso !== undefined ||
    filters.maxIso !== undefined ||
    filters.minAperture !== undefined ||
    filters.maxAperture !== undefined
  );
  const hasCameraFilter = !!filters.camera;
  const hasLensFilter = !!filters.lens;
  const hasAspectRatioFilter = !!(filters.aspectRatio || filters.orientation);
  const hasDateFilter = !!(filters.startDate || filters.endDate);
  const hasTagFilter = !!filters.keyword;

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      {/* Header with close button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" fontWeight="bold">
          Filters
        </Typography>
        <IconButton onClick={onClose} size="small">
          <ChevronLeftIcon />
        </IconButton>
      </Box>

      {/* Search */}
      <Box sx={{ p: 0.75, borderBottom: 1, borderColor: 'divider' }}>
        <SearchBar
          value={filters.search || ''}
          onChange={(search) => onFilterChange({ search })}
        />
      </Box>

      {/* Filter content - flex column, expanded section fills remaining space */}
      <Box
        sx={{
          flexGrow: 1,
          p: 0.75,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          overflow: 'hidden',
        }}
      >
          {/* Sort - always visible */}
          <Box sx={{ ...sectionSx, flexShrink: 0 }}>
            <Typography
              variant="caption"
              fontWeight="600"
              display="block"
              mb={0.25}
            >
              Sort
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Select
                value={filters.sortBy || 'dateCaptured'}
                onChange={(e) => onFilterChange({ sortBy: e.target.value })}
                sx={{ flex: 1 }}
              >
                <MenuItem value="dateCaptured">Date Captured</MenuItem>
                <MenuItem value="createdAt">Date Added</MenuItem>
                <MenuItem value="filename">Filename</MenuItem>
                <MenuItem value="camera">Camera</MenuItem>
                <MenuItem value="iso">ISO</MenuItem>
                <MenuItem value="aperture">Aperture</MenuItem>
              </Select>
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
            </Stack>
          </Box>

          {/* General Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'general'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="General"
              section="general"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasGeneralFilter}
              onClear={() =>
                onFilterChange({
                  label: '',
                  rating: undefined,
                  minIso: undefined,
                  maxIso: undefined,
                  minAperture: undefined,
                  maxAperture: undefined,
                })
              }
            />
            <Collapse
              in={expandedSection === 'general'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 0.5 }}>
              <Stack spacing={1}>
                {/* Color */}
                <Box>
                  <Typography
                    variant="caption"
                    fontWeight="600"
                    display="block"
                    mb={0.25}
                  >
                    Color
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box
                      onClick={() => onFilterChange({ label: '' })}
                      sx={{
                        width: 20,
                        height: 20,
                        border: 2,
                        borderColor: !filters.label
                          ? 'primary.main'
                          : 'divider',
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
                    {['Red', 'Yellow', 'Green', 'Blue', 'Purple'].map(
                      (label) => {
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
                                filters.label === label
                                  ? 'black'
                                  : 'transparent',
                              borderRadius: 0.5,
                              cursor: 'pointer',
                              '&:hover': { borderColor: 'black' },
                            }}
                          />
                        );
                      },
                    )}
                  </Stack>
                </Box>

                {/* Rating */}
                <Box>
                  <Typography
                    variant="caption"
                    fontWeight="600"
                    display="block"
                    mb={0.25}
                  >
                    Rating
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip
                      label="All"
                      size="small"
                      color={
                        filters.rating === undefined ? 'primary' : 'default'
                      }
                      onClick={() => onFilterChange({ rating: undefined })}
                      clickable
                    />
                    <Rating
                      value={filters.rating || 0}
                      onChange={(_, newValue) => {
                        onFilterChange({
                          rating:
                            newValue === 0 ? undefined : newValue || undefined,
                        });
                      }}
                      emptyIcon={
                        <StarIcon
                          style={{ opacity: 0.3 }}
                          fontSize="inherit"
                        />
                      }
                      size="small"
                    />
                  </Stack>
                </Box>

                {/* ISO Range */}
                {isoValues.length > 0 && (
                  <Box>
                    <Typography
                      variant="caption"
                      fontWeight="600"
                      display="block"
                      mb={0.25}
                    >
                      ISO
                    </Typography>
                    <Box sx={{ px: 1 }}>
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
                      />
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        sx={{ mt: -0.5 }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {Math.min(...isoValues)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {Math.max(...isoValues)}
                        </Typography>
                      </Stack>
                    </Box>
                  </Box>
                )}

                {/* Aperture Range */}
                {apertureValues.length > 0 && (
                  <Box>
                    <Typography
                      variant="caption"
                      fontWeight="600"
                      display="block"
                      mb={0.25}
                    >
                      Aperture
                    </Typography>
                    <Box sx={{ px: 1 }}>
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
                      />
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        sx={{ mt: -0.5 }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          f/{Math.min(...apertureValues)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          f/{Math.max(...apertureValues)}
                        </Typography>
                      </Stack>
                    </Box>
                  </Box>
                )}
              </Stack>
              </Box>
            </Collapse>
          </Box>

          {/* Camera Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'camera'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="Camera"
              section="camera"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasCameraFilter}
              onClear={() => onFilterChange({ camera: '' })}
            />
            <Collapse
              in={expandedSection === 'camera'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <List dense disablePadding sx={{ pt: 0.5 }}>
                <ListItem disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={!filters.camera}
                    onClick={() => onFilterChange({ camera: '' })}
                  >
                    <ListItemText
                      primary="All"
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                </ListItem>
                {cameras.map((camera) => {
                  const selected = isInList(filters.camera, camera);
                  return (
                    <ListItem key={camera} disablePadding>
                      <ListItemButton
                        sx={{ py: 0.1, px: 0.75 }}
                        selected={selected}
                        onClick={() =>
                          onFilterChange({
                            camera: toggleInList(filters.camera, camera),
                          })
                        }
                      >
                        <ListItemText
                          primary={camera}
                          primaryTypographyProps={{
                            variant: 'body2',
                            noWrap: true,
                          }}
                        />
                        {selected && <CheckIcon sx={{ fontSize: 14, ml: 0.5 }} />}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
              </Box>
            </Collapse>
          </Box>

          {/* Lens Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'lens'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="Lens"
              section="lens"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasLensFilter}
              onClear={() => onFilterChange({ lens: '' })}
            />
            <Collapse
              in={expandedSection === 'lens'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <List dense disablePadding sx={{ pt: 0.5 }}>
                <ListItem disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={!filters.lens}
                    onClick={() => onFilterChange({ lens: '' })}
                  >
                    <ListItemText
                      primary="All"
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                </ListItem>
                {lenses.map((lens) => {
                  const selected = isInList(filters.lens, lens);
                  return (
                    <ListItem key={lens} disablePadding>
                      <ListItemButton
                        sx={{ py: 0.1, px: 0.75 }}
                        selected={selected}
                        onClick={() =>
                          onFilterChange({
                            lens: toggleInList(filters.lens, lens),
                          })
                        }
                      >
                        <ListItemText
                          primary={lens}
                          primaryTypographyProps={{
                            variant: 'body2',
                            noWrap: true,
                          }}
                        />
                        {selected && <CheckIcon sx={{ fontSize: 14, ml: 0.5 }} />}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
              </Box>
            </Collapse>
          </Box>

          {/* Aspect Ratio Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'aspectRatio'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="Aspect Ratio"
              section="aspectRatio"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasAspectRatioFilter}
              onClear={() =>
                onFilterChange({ aspectRatio: '', orientation: '' })
              }
            />
            <Collapse
              in={expandedSection === 'aspectRatio'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 0.5 }}>
              <Stack spacing={0.75}>
                <Box>
                  <Typography
                    variant="caption"
                    fontWeight="600"
                    display="block"
                    mb={0.25}
                  >
                    Ratio
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.25}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Chip
                      label="All"
                      size="small"
                      color={!filters.aspectRatio ? 'primary' : 'default'}
                      onClick={() => onFilterChange({ aspectRatio: '' })}
                      clickable
                    />
                    {aspectRatioOptions.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        size="small"
                        color={
                          isInList(filters.aspectRatio, option.value)
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() =>
                          onFilterChange({
                            aspectRatio: toggleInList(
                              filters.aspectRatio,
                              option.value,
                            ),
                          })
                        }
                        clickable
                      />
                    ))}
                  </Stack>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    fontWeight="600"
                    display="block"
                    mb={0.25}
                  >
                    Orientation
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.25}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Chip
                      label="All"
                      size="small"
                      color={!filters.orientation ? 'primary' : 'default'}
                      onClick={() => onFilterChange({ orientation: '' })}
                      clickable
                    />
                    {orientationOptions.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        size="small"
                        color={
                          isInList(filters.orientation, option.value)
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() =>
                          onFilterChange({
                            orientation: toggleInList(
                              filters.orientation,
                              option.value,
                            ),
                          })
                        }
                        clickable
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
              </Box>
            </Collapse>
          </Box>

          {/* Dates Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'dates'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="Dates"
              section="dates"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasDateFilter}
              onClear={() =>
                onFilterChange({ startDate: '', endDate: '' })
              }
            />
            <Collapse
              in={expandedSection === 'dates'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 0.5 }}>
                <Chip
                  label="All Dates"
                  size="small"
                  color={
                    !filters.startDate && !filters.endDate
                      ? 'primary'
                      : 'default'
                  }
                  onClick={() =>
                    onFilterChange({ startDate: '', endDate: '' })
                  }
                  sx={{ mb: 0.5 }}
                />
                <Box>
                  {(() => {
                    const monthGroups: Record<string, string[]> = {};
                    dates.forEach((date) => {
                      const monthKey = date.substring(0, 7);
                      if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
                      monthGroups[monthKey].push(date);
                    });

                    return Object.entries(monthGroups)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([monthKey, monthDates]) => {
                        const firstDate = parseISO(monthDates[0]);
                        const monthLabel = format(firstDate, 'MMMM yyyy');
                        const isExpanded = expandedMonths.has(monthKey);
                        const totalPhotos = monthDates.reduce(
                          (sum, date) => sum + (dateCounts[date] || 0),
                          0,
                        );
                        const firstDayOfMonth = format(
                          startOfMonth(firstDate),
                          'yyyy-MM-dd',
                        );
                        const lastDayOfMonth = format(
                          endOfMonth(firstDate),
                          'yyyy-MM-dd',
                        );
                        const isMonthSelected =
                          filters.startDate === firstDayOfMonth &&
                          filters.endDate === lastDayOfMonth;

                        return (
                          <Box key={monthKey} sx={{ mb: 0.25 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 0.5,
                                bgcolor: isMonthSelected
                                  ? 'primary.main'
                                  : 'action.hover',
                                color: isMonthSelected ? 'white' : 'inherit',
                                borderRadius: 0.5,
                              }}
                            >
                              <Box
                                onClick={() => {
                                  const newExpanded = new Set(expandedMonths);
                                  if (isExpanded) {
                                    newExpanded.delete(monthKey);
                                  } else {
                                    newExpanded.add(monthKey);
                                  }
                                  setExpandedMonths(newExpanded);
                                }}
                                sx={{
                                  flex: 1,
                                  cursor: 'pointer',
                                  '&:hover': { opacity: 0.8 },
                                }}
                              >
                                <Typography variant="caption" fontWeight="600">
                                  {monthLabel} ({totalPhotos})
                                </Typography>
                              </Box>
                              <Stack
                                direction="row"
                                spacing={0.25}
                                alignItems="center"
                              >
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onFilterChange({
                                      startDate: firstDayOfMonth,
                                      endDate: lastDayOfMonth,
                                    })
                                  }
                                  sx={{
                                    p: 0.25,
                                    color: isMonthSelected
                                      ? 'white'
                                      : 'inherit',
                                    '&:hover': {
                                      bgcolor: isMonthSelected
                                        ? 'primary.dark'
                                        : 'action.selected',
                                    },
                                  }}
                                >
                                  <CalendarMonthIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedMonths);
                                    if (isExpanded) {
                                      newExpanded.delete(monthKey);
                                    } else {
                                      newExpanded.add(monthKey);
                                    }
                                    setExpandedMonths(newExpanded);
                                  }}
                                  sx={{
                                    p: 0.25,
                                    color: isMonthSelected
                                      ? 'white'
                                      : 'inherit',
                                  }}
                                >
                                  {isExpanded ? (
                                    <ExpandLessIcon sx={{ fontSize: 16 }} />
                                  ) : (
                                    <ExpandMoreIcon sx={{ fontSize: 16 }} />
                                  )}
                                </IconButton>
                              </Stack>
                            </Box>
                            <Collapse in={isExpanded}>
                              <Box
                                sx={{
                                  p: 0.25,
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(7, 1fr)',
                                  gap: 0.125,
                                }}
                              >
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(
                                  (day, i) => (
                                    <Box
                                      key={i}
                                      sx={{
                                        textAlign: 'center',
                                        fontSize: '0.65rem',
                                        fontWeight: 'bold',
                                        color: 'text.secondary',
                                      }}
                                    >
                                      {day}
                                    </Box>
                                  ),
                                )}
                                {(() => {
                                  const firstOfMonth = startOfMonth(firstDate);
                                  const lastOfMonth = endOfMonth(firstDate);
                                  const daysInMonth = eachDayOfInterval({
                                    start: firstOfMonth,
                                    end: lastOfMonth,
                                  });
                                  const startDay = getDay(firstOfMonth);

                                  const cells = [];
                                  for (let i = 0; i < startDay; i++) {
                                    cells.push(<Box key={`empty-${i}`} />);
                                  }

                                  daysInMonth.forEach((day) => {
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const count = dateCounts[dateStr] || 0;
                                    const isSelected =
                                      filters.startDate === dateStr &&
                                      filters.endDate === dateStr;

                                    cells.push(
                                      <Box
                                        key={dateStr}
                                        onClick={() =>
                                          count > 0
                                            ? onFilterChange({
                                                startDate: dateStr,
                                                endDate: dateStr,
                                              })
                                            : null
                                        }
                                        sx={{
                                          aspectRatio: '1',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '0.7rem',
                                          borderRadius: 0.5,
                                          cursor:
                                            count > 0 ? 'pointer' : 'default',
                                          bgcolor: isSelected
                                            ? 'primary.main'
                                            : count > 0
                                              ? 'action.hover'
                                              : 'transparent',
                                          color: isSelected
                                            ? 'white'
                                            : count > 0
                                              ? 'text.primary'
                                              : 'text.disabled',
                                          '&:hover':
                                            count > 0
                                              ? {
                                                  bgcolor: isSelected
                                                    ? 'primary.dark'
                                                    : 'action.selected',
                                                }
                                              : {},
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          fontSize="0.65rem"
                                        >
                                          {format(day, 'd')}
                                        </Typography>
                                        {count > 0 && (
                                          <Typography
                                            variant="caption"
                                            fontSize="0.5rem"
                                            sx={{ opacity: 0.7 }}
                                          >
                                            {count}
                                          </Typography>
                                        )}
                                      </Box>,
                                    );
                                  });

                                  return cells;
                                })()}
                              </Box>
                            </Collapse>
                          </Box>
                        );
                      });
                  })()}
                </Box>
              </Box>
            </Collapse>
          </Box>

          {/* Tags Section */}
          <Box
            sx={{
              ...sectionSx,
              ...(expandedSection === 'tags'
                ? {
                    flexShrink: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { flexShrink: 0 }),
            }}
          >
            <SectionHeader
              label="Tags"
              section="tags"
              expandedSection={expandedSection}
              onToggle={toggleSection}
              hasActiveFilter={hasTagFilter}
              onClear={() => onFilterChange({ keyword: '' })}
            />
            <Collapse
              in={expandedSection === 'tags'}
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                },
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <List dense disablePadding sx={{ pt: 0.5 }}>
                <ListItem disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={!filters.keyword}
                    onClick={() => onFilterChange({ keyword: '' })}
                  >
                    <ListItemText
                      primary="All"
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                </ListItem>
                {keywords.map((kw) => {
                  const selected = isInList(filters.keyword, kw);
                  return (
                    <ListItem key={kw} disablePadding>
                      <ListItemButton
                        sx={{ py: 0.1, px: 0.75 }}
                        selected={selected}
                        onClick={() =>
                          onFilterChange({
                            keyword: toggleInList(filters.keyword, kw),
                          })
                        }
                      >
                        <ListItemText
                          primary={kw}
                          primaryTypographyProps={{
                            variant: 'body2',
                            noWrap: true,
                          }}
                        />
                        {selected && <CheckIcon sx={{ fontSize: 14, ml: 0.5 }} />}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
              </Box>
            </Collapse>
          </Box>
      </Box>

      {/* Reset button - always visible */}
      <Box sx={{ p: 0.75, borderTop: 1, borderColor: 'divider' }}>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={() =>
            onFilterChange({
              search: '',
              camera: '',
              lens: '',
              aspectRatio: '',
              orientation: '',
              minIso: undefined,
              maxIso: undefined,
              minAperture: undefined,
              maxAperture: undefined,
              startDate: '',
              endDate: '',
              keyword: '',
              folder: '',
              label: '',
              rating: undefined,
              sortBy: 'dateCaptured',
              sortOrder: 'desc',
            })
          }
        >
          Clear Filters
        </Button>
      </Box>

      {/* Logout button - always visible */}
      <Box sx={{ p: 0.75, borderTop: 1, borderColor: 'divider' }}>
        <Button
          variant="text"
          size="small"
          fullWidth
          startIcon={<LogoutIcon fontSize="small" />}
          onClick={onLogout}
          color="inherit"
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
});

export default FilterPanel;
