import {
  CalendarMonth as CalendarMonthIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
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
import { useEffect, useState } from 'react';
import SearchBar from '@/components/SearchBar';
import type { PhotoFilters } from '@/types';

const sectionSx = {
  flexGrow: 1,
  bgcolor: 'action.hover',
  borderRadius: 1,
  p: 1,
};

interface FilterPanelProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
}

function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  const [cameras, setCameras] = useState<string[]>([]);
  const [lenses, setLenses] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [dateCounts, setDateCounts] = useState<Record<string, number>>({});
  const [keywords, setKeywords] = useState<string[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch all metadata
    Promise.all([
      fetch('/api/photos/meta/cameras', { credentials: 'include' }).then(
        (res) => res.json(),
      ),
      fetch('/api/photos/meta/lenses', { credentials: 'include' }).then((res) =>
        res.json(),
      ),
      fetch('/api/photos/meta/dates', { credentials: 'include' }).then((res) =>
        res.json(),
      ),
      fetch('/api/photos/meta/dates-with-counts', {
        credentials: 'include',
      }).then((res) => res.json()),
      fetch('/api/photos/meta/keywords', { credentials: 'include' }).then(
        (res) => res.json(),
      ),
    ])
      .then(
        ([
          camerasData,
          lensesData,
          datesData,
          dateCountsData,
          keywordsData,
        ]) => {
          setCameras(camerasData);
          setLenses(lensesData);
          setDates(datesData);
          // Convert array to map
          const countsMap: Record<string, number> = {};
          dateCountsData.forEach((item: { date: string; count: number }) => {
            countsMap[item.date] = item.count;
          });
          setDateCounts(countsMap);
          setKeywords(keywordsData);
        },
      )
      .catch((err) => console.error('Failed to fetch metadata:', err));
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
      {/* Search */}
      <Box sx={{ p: 0.75, borderBottom: 1, borderColor: 'divider' }}>
        <SearchBar
          value={filters.search || ''}
          onChange={(search) => onFilterChange({ search })}
        />
      </Box>

      {/* Scrollable filter content */}
      <Box
        sx={{
          overflowY: 'auto',
          flexGrow: 1,
          p: 0.75,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack spacing={0.75} sx={{ flexGrow: 1 }}>
          {/* Camera List */}
          <Box sx={sectionSx}>
            <Typography
              variant="caption"
              fontWeight="600"
              display="block"
              mb={0.25}
            >
              Camera
            </Typography>
            <List
              dense
              disablePadding
              sx={{ maxHeight: 120, overflowY: 'auto' }}
            >
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
              {cameras.map((camera) => (
                <ListItem key={camera} disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={filters.camera === camera}
                    onClick={() => onFilterChange({ camera })}
                  >
                    <ListItemText
                      primary={camera}
                      primaryTypographyProps={{
                        variant: 'body2',
                        noWrap: true,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Lens List */}
          <Box sx={sectionSx}>
            <Typography
              variant="caption"
              fontWeight="600"
              display="block"
              mb={0.25}
            >
              Lens
            </Typography>
            <List
              dense
              disablePadding
              sx={{ maxHeight: 120, overflowY: 'auto' }}
            >
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
              {lenses.map((lens) => (
                <ListItem key={lens} disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={filters.lens === lens}
                    onClick={() => onFilterChange({ lens })}
                  >
                    <ListItemText
                      primary={lens}
                      primaryTypographyProps={{
                        variant: 'body2',
                        noWrap: true,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Date Calendar */}
          <Box sx={sectionSx}>
            <Typography
              variant="caption"
              fontWeight="600"
              display="block"
              mb={0.25}
            >
              Dates
            </Typography>
            <Chip
              label="All Dates"
              size="small"
              color={
                !filters.startDate && !filters.endDate ? 'primary' : 'default'
              }
              onClick={() => onFilterChange({ startDate: '', endDate: '' })}
              sx={{ mb: 0.5 }}
            />
            <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
              {(() => {
                // Group dates by month
                const monthGroups: Record<string, string[]> = {};
                dates.forEach((date) => {
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
                              '&:hover': {
                                opacity: 0.8,
                              },
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
                                color: isMonthSelected ? 'white' : 'inherit',
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
                                color: isMonthSelected ? 'white' : 'inherit',
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
                            {/* Day headers */}
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
                            {/* Calendar days */}
                            {(() => {
                              const firstOfMonth = startOfMonth(firstDate);
                              const lastOfMonth = endOfMonth(firstDate);
                              const daysInMonth = eachDayOfInterval({
                                start: firstOfMonth,
                                end: lastOfMonth,
                              });
                              const startDay = getDay(firstOfMonth);

                              const cells = [];
                              // Empty cells before month starts
                              for (let i = 0; i < startDay; i++) {
                                cells.push(<Box key={`empty-${i}`} />);
                              }

                              // Days with photos
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
                                      cursor: count > 0 ? 'pointer' : 'default',
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

          {/* Tags Filter */}
          <Box sx={sectionSx}>
            <Typography
              variant="caption"
              fontWeight="600"
              display="block"
              mb={0.25}
            >
              Tags
            </Typography>
            <List
              dense
              disablePadding
              sx={{ maxHeight: 120, overflowY: 'auto' }}
            >
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
              {keywords.map((kw) => (
                <ListItem key={kw} disablePadding>
                  <ListItemButton
                    sx={{ py: 0.1, px: 0.75 }}
                    selected={filters.keyword === kw}
                    onClick={() => onFilterChange({ keyword: kw })}
                  >
                    <ListItemText
                      primary={kw}
                      primaryTypographyProps={{
                        variant: 'body2',
                        noWrap: true,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </Stack>
      </Box>

      {/* Reset at bottom-right */}
      <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() =>
            onFilterChange({
              search: '',
              camera: '',
              lens: '',
              minIso: undefined,
              maxIso: undefined,
              minAperture: undefined,
              maxAperture: undefined,
              startDate: '',
              endDate: '',
              keyword: '',
              folder: '',
              sortBy: 'dateCaptured',
              sortOrder: 'desc',
            })
          }
        >
          Reset
        </Button>
      </Box>
    </Box>
  );
}

export default FilterPanel;
