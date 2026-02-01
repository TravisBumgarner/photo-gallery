import {
  CameraAlt as CameraIcon,
  DateRange as DateRangeIcon,
  Lens as LensIcon,
  PhotoLibrary as PhotoIcon,
} from '@mui/icons-material';
import {
  Box,
  CircularProgress,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StatsFilterBar from '@/components/StatsFilterBar';
import { subtleBackground } from '@/styles/styleConsts';
import type { StatsFilters, StatsResponse } from '@/types';
import { binFocalLengths, mapDayOfWeek } from '@/utils/statsHelpers';

const CHART_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#a4de6c',
];

const DEBOUNCE_MS = 400;

function StatsPage() {
  const [filters, setFilters] = useState<StatsFilters>({});
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchStats = useCallback((currentFilters: StatsFilters) => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== null) {
        params.append(key, String(value));
      }
    });

    fetch(`/api/photos/stats?${params}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to fetch stats:', err))
      .finally(() => setLoading(false));
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (newFilters: StatsFilters) => {
    setFilters(newFilters);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchStats(newFilters), DEBOUNCE_MS);
  };

  // Summary derived values
  const dateRange =
    stats && stats.photosOverTime.length > 0
      ? `${stats.photosOverTime[0].month} - ${stats.photosOverTime[stats.photosOverTime.length - 1].month}`
      : '-';
  const cameraCount = stats?.cameraDistribution.length ?? 0;
  const lensCount = stats?.lensDistribution.length ?? 0;

  const focalLengthBinned = stats
    ? binFocalLengths(stats.focalLengthDistribution)
    : [];
  const dayOfWeekMapped = stats ? mapDayOfWeek(stats.photosByDayOfWeek) : [];

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'hsl(0 0% 15%)',
      border: '1px solid hsl(0 0% 25%)',
      borderRadius: 4,
      color: 'hsl(0 0% 90%)',
    },
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <StatsFilterBar filters={filters} onFilterChange={handleFilterChange} />

      {loading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexGrow: 1,
            minHeight: 300,
          }}
        >
          <CircularProgress />
        </Box>
      ) : !stats ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography color="text.secondary">
            Failed to load statistics.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ p: 2, flexGrow: 1 }}>
          {/* Summary Cards */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? 'repeat(2, 1fr)'
                : 'repeat(4, 1fr)',
              gap: 2,
              mb: 3,
            }}
          >
            <SummaryCard
              icon={<PhotoIcon />}
              label="Total Photos"
              value={stats.totalPhotos.toLocaleString()}
            />
            <SummaryCard
              icon={<DateRangeIcon />}
              label="Date Range"
              value={dateRange}
            />
            <SummaryCard
              icon={<CameraIcon />}
              label="Cameras"
              value={String(cameraCount)}
            />
            <SummaryCard
              icon={<LensIcon />}
              label="Lenses"
              value={String(lensCount)}
            />
          </Box>

          {/* Charts Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
              gap: 2,
            }}
          >
            {/* 1. Photos Over Time - Area */}
            <ChartCard title="Photos Over Time">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.photosOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 2. Camera Distribution - Horizontal Bar */}
            <ChartCard title="Camera Distribution">
              <ResponsiveContainer width="100%" height={Math.max(250, stats.cameraDistribution.length * 35)}>
                <BarChart
                  data={stats.cameraDistribution}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis
                    type="category"
                    dataKey="camera"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    width={75}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 3. Lens Distribution - Horizontal Bar */}
            <ChartCard title="Lens Distribution">
              <ResponsiveContainer width="100%" height={Math.max(250, stats.lensDistribution.length * 35)}>
                <BarChart
                  data={stats.lensDistribution}
                  layout="vertical"
                  margin={{ left: 120 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis
                    type="category"
                    dataKey="lens"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(0 0% 50%)"
                    width={115}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 4. Focal Length Distribution - Bar (binned) */}
            <ChartCard title="Focal Length Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={focalLengthBinned}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis dataKey="bin" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#ff7300" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 5. Aperture Distribution - Bar */}
            <ChartCard title="Aperture Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.apertureDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis
                    dataKey="aperture"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    tickFormatter={(v) => `f/${v}`}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 6. ISO Distribution - Bar */}
            <ChartCard title="ISO Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.isoDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis dataKey="iso" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 7. Aspect Ratio Distribution - Pie */}
            <ChartCard title="Aspect Ratio Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.aspectRatioDistribution}
                    dataKey="count"
                    nameKey="aspectRatio"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(props: { aspectRatio?: string; percent?: number }) =>
                      `${props.aspectRatio ?? ''} (${((props.percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {stats.aspectRatioDistribution.map((_, index) => (
                      <Cell
                        key={index}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 8. Rating Distribution - Bar */}
            <ChartCard title="Rating Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.ratingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis
                    dataKey="rating"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    tickFormatter={(v) => (v === 0 ? 'Unrated' : `${v} star`)}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#FF8042" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 9. Shutter Speed Distribution - Bar */}
            <ChartCard title="Shutter Speed Distribution">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.shutterSpeedDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis
                    dataKey="shutterSpeed"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(0 0% 50%)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#a4de6c" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 10. Shooting Time - Day of Week + Hour of Day */}
            <ChartCard title="Shooting Time">
              <Stack spacing={2}>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    By Day of Week
                  </Typography>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={dayOfWeekMapped}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    By Hour of Day
                  </Typography>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={stats.photosByHourOfDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 11 }}
                        stroke="hsl(0 0% 50%)"
                        tickFormatter={(v) => `${v}:00`}
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Stack>
            </ChartCard>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        bgcolor: subtleBackground('slightly'),
      }}
    >
      <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      sx={{
        p: 2,
        bgcolor: subtleBackground('slightly'),
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export default StatsPage;
