import { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    Typography,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Chip,
    Rating,
    Select,
    MenuItem,
    FormControl,
    Collapse,
    Slider,
} from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, Star as StarIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, CalendarMonth as CalendarMonthIcon } from '@mui/icons-material';
import { PhotoFilters } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay } from 'date-fns';

interface FilterPanelProps {
    filters: PhotoFilters;
    onFilterChange: (filters: Partial<PhotoFilters>) => void;
    onClose: () => void;
}

const aspectRatioOptions = [
    { label: 'All', value: '' },
    { label: '1:1', value: '1' },
    { label: '3:2', value: '1.5' },
    { label: '16:9', value: '1.78' },
    { label: '2:3', value: '0.67' },
    { label: '9:16', value: '0.56' },
];

function FilterPanel({ filters, onFilterChange, onClose }: FilterPanelProps) {
    const [cameras, setCameras] = useState<string[]>([]);
    const [isoValues, setIsoValues] = useState<number[]>([]);
    const [apertureValues, setApertureValues] = useState<number[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [dateCounts, setDateCounts] = useState<Record<string, number>>({});
    const [labels, setLabels] = useState<string[]>([]);
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

    // Local state for slider values during dragging
    const [isoRange, setIsoRange] = useState<[number, number] | null>(null);
    const [apertureRange, setApertureRange] = useState<[number, number] | null>(null);

    useEffect(() => {
        // Fetch all metadata
        Promise.all([
            fetch('/api/photos/meta/cameras', { credentials: 'include' }).then(res => res.json()),
            fetch('/api/photos/meta/iso-values', { credentials: 'include' }).then(res => res.json()),
            fetch('/api/photos/meta/aperture-values', { credentials: 'include' }).then(res => res.json()),
            fetch('/api/photos/meta/dates', { credentials: 'include' }).then(res => res.json()),
            fetch('/api/photos/meta/dates-with-counts', { credentials: 'include' }).then(res => res.json()),
            fetch('/api/photos/meta/labels', { credentials: 'include' }).then(res => res.json()),
        ])
            .then(([camerasData, isoData, apertureData, datesData, dateCountsData, labelsData]) => {
                setCameras(camerasData);
                setIsoValues(isoData);
                setApertureValues(apertureData);
                setDates(datesData);
                // Convert array to map
                const countsMap: Record<string, number> = {};
                dateCountsData.forEach((item: { date: string; count: number }) => {
                    countsMap[item.date] = item.count;
                });
                setDateCounts(countsMap);
                setLabels(labelsData);
            })
            .catch(err => console.error('Failed to fetch metadata:', err));
    }, []);

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
                <Typography variant="body2" fontWeight="bold">Filters</Typography>
                <IconButton onClick={onClose} size="small">
                    <ChevronLeftIcon />
                </IconButton>
            </Box>

            {/* Scrollable filter content */}
            <Box sx={{ overflowY: 'auto', flexGrow: 1, p: 0.75 }}>
                <Stack spacing={0.75}>
                    {/* Camera List */}
                    <Box>
                        <Typography variant="caption" fontWeight="600" display="block" mb={0.25}>
                            Camera
                        </Typography>
                        <List dense disablePadding sx={{ maxHeight: 120, overflowY: 'auto' }}>
                            <ListItem disablePadding>
                                <ListItemButton
                                    sx={{ py: 0.1, px: 0.75 }}
                                    selected={!filters.camera}
                                    onClick={() => onFilterChange({ camera: '' })}
                                >
                                    <ListItemText primary="All" primaryTypographyProps={{ variant: 'body2' }} />
                                </ListItemButton>
                            </ListItem>
                            {cameras.map((camera) => (
                                <ListItem key={camera} disablePadding>
                                    <ListItemButton
                                        sx={{ py: 0.1, px: 0.75 }}
                                        selected={filters.camera === camera}
                                        onClick={() => onFilterChange({ camera })}
                                    >
                                        <ListItemText
                                            primary={camera}
                                            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </Box>

                    <Divider />

                    {/* Aspect Ratio */}
                    <Box>
                        <Typography variant="caption" fontWeight="600" display="block" mb={0.25}>
                            Aspect Ratio
                        </Typography>
                        <Stack direction="row" spacing={0.25} flexWrap="wrap" useFlexGap>
                            {aspectRatioOptions.map((option) => (
                                <Chip
                                    key={option.value}
                                    label={option.label}
                                    size="small"
                                    color={filters.aspectRatio === option.value || (!filters.aspectRatio && option.value === '') ? 'primary' : 'default'}
                                    onClick={() => onFilterChange({ aspectRatio: option.value })}
                                    clickable
                                />
                            ))}
                        </Stack>
                    </Box>

                    <Divider />

                    {/* ISO Range */}
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                            <Typography variant="caption" fontWeight="600">
                                ISO
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {isoRange ? `${isoRange[0]} - ${isoRange[1]}` : `${filters.minIso ?? Math.min(...isoValues)} - ${filters.maxIso ?? Math.max(...isoValues)}`}
                            </Typography>
                        </Stack>
                        {isoValues.length > 0 && (
                            <Slider
                                value={isoRange || [
                                    filters.minIso ?? Math.min(...isoValues),
                                    filters.maxIso ?? Math.max(...isoValues)
                                ]}
                                onChange={(_, newValue) => {
                                    setIsoRange(newValue as [number, number]);
                                }}
                                onChangeCommitted={(_, newValue) => {
                                    const [min, max] = newValue as number[];
                                    const minIso = Math.min(...isoValues);
                                    const maxIso = Math.max(...isoValues);
                                    onFilterChange({
                                        minIso: min === minIso ? undefined : min,
                                        maxIso: max === maxIso ? undefined : max
                                    });
                                    setIsoRange(null);
                                }}
                                min={Math.min(...isoValues)}
                                max={Math.max(...isoValues)}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        )}
                    </Box>

                    <Divider />

                    {/* Aperture Range */}
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                            <Typography variant="caption" fontWeight="600">
                                Aperture
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {apertureRange ? `f/${apertureRange[0]} - f/${apertureRange[1]}` : `f/${filters.minAperture ?? Math.min(...apertureValues)} - f/${filters.maxAperture ?? Math.max(...apertureValues)}`}
                            </Typography>
                        </Stack>
                        {apertureValues.length > 0 && (
                            <Slider
                                value={apertureRange || [
                                    filters.minAperture ?? Math.min(...apertureValues),
                                    filters.maxAperture ?? Math.max(...apertureValues)
                                ]}
                                onChange={(_, newValue) => {
                                    setApertureRange(newValue as [number, number]);
                                }}
                                onChangeCommitted={(_, newValue) => {
                                    const [min, max] = newValue as number[];
                                    const minAperture = Math.min(...apertureValues);
                                    const maxAperture = Math.max(...apertureValues);
                                    onFilterChange({
                                        minAperture: min === minAperture ? undefined : min,
                                        maxAperture: max === maxAperture ? undefined : max
                                    });
                                    setApertureRange(null);
                                }}
                                min={Math.min(...apertureValues)}
                                max={Math.max(...apertureValues)}
                                valueLabelDisplay="auto"
                                valueLabelFormat={(value) => `f/${value}`}
                                size="small"
                            />
                        )}
                    </Box>

                    <Divider />

                    {/* Date Calendar */}
                    <Box>
                        <Typography variant="caption" fontWeight="600" display="block" mb={0.25}>
                            Dates
                        </Typography>
                        <Chip
                            label="All Dates"
                            size="small"
                            color={!filters.startDate && !filters.endDate ? 'primary' : 'default'}
                            onClick={() => onFilterChange({ startDate: '', endDate: '' })}
                            sx={{ mb: 0.5 }}
                        />
                        <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
                            {(() => {
                                // Group dates by month
                                const monthGroups: Record<string, string[]> = {};
                                dates.forEach(date => {
                                    const monthKey = date.substring(0, 7); // YYYY-MM
                                    if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
                                    monthGroups[monthKey].push(date);
                                });

                                return Object.entries(monthGroups)
                                    .sort(([a], [b]) => b.localeCompare(a))
                                    .map(([monthKey, monthDates]) => {
                                        const firstDate = parseISO(monthDates[0]);
                                        const monthLabel = format(firstDate, 'MMMM yyyy');
                                        const isExpanded = expandedMonths.has(monthKey);
                                        const totalPhotos = monthDates.reduce((sum, date) => sum + (dateCounts[date] || 0), 0);
                                        const firstDayOfMonth = format(startOfMonth(firstDate), 'yyyy-MM-dd');
                                        const lastDayOfMonth = format(endOfMonth(firstDate), 'yyyy-MM-dd');
                                        const isMonthSelected = filters.startDate === firstDayOfMonth && filters.endDate === lastDayOfMonth;

                                        return (
                                            <Box key={monthKey} sx={{ mb: 0.25 }}>
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        p: 0.5,
                                                        bgcolor: isMonthSelected ? 'primary.main' : 'action.hover',
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
                                                            '&:hover': {
                                                                opacity: 0.8,
                                                            },
                                                        }}
                                                    >
                                                        <Typography variant="caption" fontWeight="600">
                                                            {monthLabel} ({totalPhotos})
                                                        </Typography>
                                                    </Box>
                                                    <Stack direction="row" spacing={0.25} alignItems="center">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => onFilterChange({ startDate: firstDayOfMonth, endDate: lastDayOfMonth })}
                                                            sx={{
                                                                p: 0.25,
                                                                color: isMonthSelected ? 'white' : 'inherit',
                                                                '&:hover': {
                                                                    bgcolor: isMonthSelected ? 'primary.dark' : 'action.selected',
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
                                                                color: isMonthSelected ? 'white' : 'inherit',
                                                            }}
                                                        >
                                                            {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                                                        </IconButton>
                                                    </Stack>
                                                </Box>
                                                <Collapse in={isExpanded}>
                                                    <Box sx={{ p: 0.25, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.125 }}>
                                                        {/* Day headers */}
                                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                                            <Box key={i} sx={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: 'text.secondary' }}>
                                                                {day}
                                                            </Box>
                                                        ))}
                                                        {/* Calendar days */}
                                                        {(() => {
                                                            const firstOfMonth = startOfMonth(firstDate);
                                                            const lastOfMonth = endOfMonth(firstDate);
                                                            const daysInMonth = eachDayOfInterval({ start: firstOfMonth, end: lastOfMonth });
                                                            const startDay = getDay(firstOfMonth);

                                                            const cells = [];
                                                            // Empty cells before month starts
                                                            for (let i = 0; i < startDay; i++) {
                                                                cells.push(<Box key={`empty-${i}`} />);
                                                            }

                                                            // Days with photos
                                                            daysInMonth.forEach(day => {
                                                                const dateStr = format(day, 'yyyy-MM-dd');
                                                                const count = dateCounts[dateStr] || 0;
                                                                const isSelected = filters.startDate === dateStr && filters.endDate === dateStr;

                                                                cells.push(
                                                                    <Box
                                                                        key={dateStr}
                                                                        onClick={() => count > 0 ? onFilterChange({ startDate: dateStr, endDate: dateStr }) : null}
                                                                        sx={{
                                                                            aspectRatio: '1',
                                                                            display: 'flex',
                                                                            flexDirection: 'column',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '0.7rem',
                                                                            borderRadius: 0.5,
                                                                            cursor: count > 0 ? 'pointer' : 'default',
                                                                            bgcolor: isSelected ? 'primary.main' : count > 0 ? 'action.hover' : 'transparent',
                                                                            color: isSelected ? 'white' : count > 0 ? 'text.primary' : 'text.disabled',
                                                                            '&:hover': count > 0 ? {
                                                                                bgcolor: isSelected ? 'primary.dark' : 'action.selected',
                                                                            } : {},
                                                                        }}
                                                                    >
                                                                        <Typography variant="caption" fontSize="0.65rem">
                                                                            {format(day, 'd')}
                                                                        </Typography>
                                                                        {count > 0 && (
                                                                            <Typography variant="caption" fontSize="0.5rem" sx={{ opacity: 0.7 }}>
                                                                                {count}
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
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

                    <Divider />

                    {/* Rating Filter */}
                    <Box>
                        <Typography variant="caption" fontWeight="600" display="block" mb={0.25}>
                            Rating
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Chip
                                label="All"
                                size="small"
                                color={filters.rating === undefined ? 'primary' : 'default'}
                                onClick={() => onFilterChange({ rating: undefined })}
                            />
                            <Rating
                                value={filters.rating || 0}
                                onChange={(_, newValue) => {
                                    onFilterChange({ rating: newValue === 0 ? undefined : newValue || undefined });
                                }}
                                emptyIcon={<StarIcon style={{ opacity: 0.3 }} fontSize="inherit" />}
                                size="small"
                            />
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Label Filter */}
                    <Box>
                        <Typography variant="caption" fontWeight="600" display="block" mb={0.25}>
                            Color Label
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Box
                                onClick={() => onFilterChange({ label: '' })}
                                sx={{
                                    width: 32,
                                    height: 32,
                                    border: 2,
                                    borderColor: !filters.label ? 'primary.main' : 'divider',
                                    borderRadius: 0.5,
                                    cursor: 'pointer',
                                    bgcolor: 'background.paper',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    '&:hover': {
                                        borderColor: 'primary.main',
                                    },
                                }}
                            >
                                All
                            </Box>
                            {['Red', 'Yellow', 'Green', 'Blue', 'Purple'].map((label) => {
                                const labelColors: Record<string, string> = {
                                    'Red': '#f44336',
                                    'Yellow': '#ffeb3b',
                                    'Green': '#4caf50',
                                    'Blue': '#2196f3',
                                    'Purple': '#9c27b0',
                                };
                                return (
                                    <Box
                                        key={label}
                                        onClick={() => onFilterChange({ label })}
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            bgcolor: labelColors[label],
                                            border: 2,
                                            borderColor: filters.label === label ? 'black' : 'transparent',
                                            borderRadius: 0.5,
                                            cursor: 'pointer',
                                            '&:hover': {
                                                borderColor: 'black',
                                            },
                                        }}
                                    />
                                );
                            })}
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Reset Button */}
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={() =>
                            onFilterChange({
                                search: '',
                                camera: '',
                                aspectRatio: '',
                                minIso: undefined,
                                maxIso: undefined,
                                minAperture: undefined,
                                maxAperture: undefined,
                                startDate: '',
                                endDate: '',
                                sortBy: 'dateCaptured',
                                sortOrder: 'desc',
                            })
                        }
                    >
                        Reset
                    </Button>
                </Stack>
            </Box>
        </Box>
    );
}

export default FilterPanel;
