import {
  CameraAlt as CameraIcon,
  Close as CloseIcon,
  DateRange as DateRangeIcon,
  Fullscreen as FullscreenIcon,
  Lens as LensIcon,
  PhotoLibrary as PhotoIcon,
} from '@mui/icons-material';
import {
  Box,
  CircularProgress,
  Dialog,
  IconButton,
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
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
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
            <ChartCard
              title="Photos Over Time"
              renderExpanded={() => (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.photosOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
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
              )}
            >
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
            <ChartCard
              title="Camera Distribution"
              renderExpanded={() => (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.cameraDistribution}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                    <YAxis
                      type="category"
                      dataKey="camera"
                      tick={{ fontSize: 12 }}
                      stroke="hsl(0 0% 50%)"
                      width={200}
                    />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            >
              <ResponsiveContainer width="100%" height={Math.max(250, stats.cameraDistribution.length * 35)}>
                <BarChart
                  data={stats.cameraDistribution}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis
                    type="category"
                    dataKey="camera"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    width={160}
                    tickFormatter={(v) => v.length > 22 ? `${v.slice(0, 20)}...` : v}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 3. Lens Distribution - Horizontal Bar */}
            <ChartCard
              title="Lens Distribution"
              renderExpanded={() => (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.lensDistribution}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                    <YAxis
                      type="category"
                      dataKey="lens"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(0 0% 50%)"
                      width={220}
                    />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="#ffc658" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            >
              <ResponsiveContainer width="100%" height={Math.max(250, stats.lensDistribution.length * 35)}>
                <BarChart
                  data={stats.lensDistribution}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis
                    type="category"
                    dataKey="lens"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(0 0% 50%)"
                    width={180}
                    tickFormatter={(v) => v.length > 28 ? `${v.slice(0, 26)}...` : v}
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
            <ChartCard
              title="Shooting Time"
              renderExpanded={() => (
                <Stack spacing={3} sx={{ height: '100%' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1, mb: 1 }}>
                      By Day of Week
                    </Typography>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={dayOfWeekMapped}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                        <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="count" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1, mb: 1 }}>
                      By Hour of Day
                    </Typography>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={stats.photosByHourOfDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 12 }}
                          stroke="hsl(0 0% 50%)"
                          tickFormatter={(v) => `${v}:00`}
                        />
                        <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 50%)" />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="count" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Stack>
              )}
            >
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

            {/* 11. Photos by Year - Bar */}
            <ChartCard title="Photos by Year">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.photosByYear}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#8884d8">
                    {stats.photosByYear.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 12. Year-over-Year Comparison - Line */}
            <ChartCard title="Year-over-Year Comparison">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={stats.yearOverYear}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    tickFormatter={(v) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][v - 1] || v}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <Tooltip {...tooltipStyle} />
                  <Legend />
                  {stats.photosByYear.map((yearData, index) => (
                    <Line
                      key={yearData.year}
                      type="monotone"
                      dataKey={yearData.year}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 13. Top 10 Most Productive Days - Horizontal Bar */}
            <ChartCard title="Top 10 Most Productive Days">
              <ResponsiveContainer width="100%" height={Math.max(250, stats.topDays.length * 30)}>
                <BarChart data={stats.topDays} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
                  <YAxis
                    type="category"
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    width={100}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#00C49F">
                    {stats.topDays.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* 14. Camera + Lens Combinations - Table/Heatmap style */}
            <ChartCard title="Camera + Lens Combinations">
              <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                {stats.cameraLensCombinations.slice(0, 20).map((combo, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.5,
                      borderBottom: '1px solid hsl(0 0% 20%)',
                    }}
                  >
                    <Box
                      sx={{
                        width: Math.min(100, (combo.count / stats.cameraLensCombinations[0].count) * 100),
                        height: 8,
                        bgcolor: CHART_COLORS[index % CHART_COLORS.length],
                        borderRadius: 1,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="caption" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                      {combo.camera} + {combo.lens}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {combo.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </ChartCard>

            {/* 15. Shooting Frequency Calendar Heatmap */}
            <ChartCard title="Shooting Frequency Calendar">
              <CalendarHeatmap data={stats.photosByDate} />
            </ChartCard>

            {/* 16. Equipment Usage Over Time - Camera */}
            <ChartCard title="Camera Usage Over Time">
              <EquipmentOverTimeChart
                data={stats.cameraUsageOverTime}
                dataKey="camera"
                tooltipStyle={tooltipStyle}
              />
            </ChartCard>

            {/* 17. Equipment Usage Over Time - Lens */}
            <ChartCard title="Lens Usage Over Time">
              <EquipmentOverTimeChart
                data={stats.lensUsageOverTime}
                dataKey="lens"
                tooltipStyle={tooltipStyle}
              />
            </ChartCard>

            {/* 18. Focal Length vs Aperture Scatter */}
            <ChartCard title="Focal Length vs Aperture">
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
                  <XAxis
                    type="number"
                    dataKey="focalLength"
                    name="Focal Length"
                    unit="mm"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                  />
                  <YAxis
                    type="number"
                    dataKey="aperture"
                    name="Aperture"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(0 0% 50%)"
                    tickFormatter={(v) => `f/${v}`}
                  />
                  <ZAxis type="number" dataKey="count" range={[20, 400]} name="Count" />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value, name) => {
                      if (name === 'Aperture') return [`f/${value}`, name];
                      if (name === 'Focal Length') return [`${value}mm`, name];
                      return [value, name];
                    }}
                  />
                  <Scatter data={stats.focalLengthVsAperture} fill="#8884d8" />
                </ScatterChart>
              </ResponsiveContainer>
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
  renderExpanded,
}: {
  title: string;
  children: React.ReactNode;
  renderExpanded?: () => React.ReactNode;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <Paper
        sx={{
          p: 2,
          bgcolor: subtleBackground('slightly'),
          maxHeight: '50vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Typography variant="subtitle2">{title}</Typography>
          <IconButton
            size="small"
            onClick={() => setIsFullscreen(true)}
            sx={{ color: 'text.secondary' }}
          >
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ flexGrow: 1, minHeight: 0 }}>{children}</Box>
      </Paper>

      <Dialog
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            width: '90vw',
            height: '90vh',
            maxWidth: '90vw',
            bgcolor: subtleBackground('slightly'),
          },
        }}
      >
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6">{title}</Typography>
            <IconButton onClick={() => setIsFullscreen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, minHeight: 0 }}>
            {renderExpanded ? renderExpanded() : children}
          </Box>
        </Box>
      </Dialog>
    </>
  );
}

// Calendar heatmap component (GitHub-style)
function CalendarHeatmap({ data }: { data: { date: string; count: number }[] }) {
  const dateMap = new Map(data.map((d) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Get the last 12 months of data
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  const weeks: { date: Date; count: number }[][] = [];
  let currentWeek: { date: Date; count: number }[] = [];
  const currentDate = new Date(startDate);

  // Pad to start on Sunday
  const startDay = currentDate.getDay();
  for (let i = 0; i < startDay; i++) {
    currentWeek.push({ date: new Date(0), count: -1 });
  }

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const count = dateMap.get(dateStr) ?? 0;
    currentWeek.push({ date: new Date(currentDate), count });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const getColor = (count: number) => {
    if (count < 0) return 'transparent';
    if (count === 0) return 'hsl(0 0% 15%)';
    const intensity = Math.min(count / maxCount, 1);
    return `hsl(142 ${40 + intensity * 30}% ${20 + intensity * 30}%)`;
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <Box sx={{ overflow: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, pl: '20px' }}>
        {weeks.map((week, i) => {
          const firstDay = week.find((d) => d.count >= 0);
          if (firstDay && firstDay.date.getDate() <= 7 && i > 0) {
            return (
              <Typography key={i} variant="caption" sx={{ width: 10, fontSize: 9, color: 'text.secondary' }}>
                {months[firstDay.date.getMonth()]}
              </Typography>
            );
          }
          return <Box key={i} sx={{ width: 10 }} />;
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pr: 0.5 }}>
          {['', 'M', '', 'W', '', 'F', ''].map((day, i) => (
            <Typography key={i} variant="caption" sx={{ height: 10, fontSize: 8, lineHeight: '10px', color: 'text.secondary' }}>
              {day}
            </Typography>
          ))}
        </Box>
        {weeks.map((week, weekIdx) => (
          <Box key={weekIdx} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {week.map((day, dayIdx) => (
              <Box
                key={dayIdx}
                sx={{
                  width: 10,
                  height: 10,
                  bgcolor: getColor(day.count),
                  borderRadius: 0.5,
                  cursor: day.count >= 0 ? 'pointer' : 'default',
                }}
                title={day.count >= 0 ? `${day.date.toLocaleDateString()}: ${day.count} photos` : ''}
              />
            ))}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, justifyContent: 'flex-end' }}>
        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>Less</Typography>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
          <Box
            key={intensity}
            sx={{
              width: 10,
              height: 10,
              bgcolor: intensity === 0 ? 'hsl(0 0% 15%)' : `hsl(142 ${40 + intensity * 30}% ${20 + intensity * 30}%)`,
              borderRadius: 0.5,
            }}
          />
        ))}
        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>More</Typography>
      </Box>
    </Box>
  );
}

// Equipment usage over time chart
function EquipmentOverTimeChart({
  data,
  dataKey,
  tooltipStyle,
}: {
  data: { month: string; [key: string]: string | number }[];
  dataKey: 'camera' | 'lens';
  tooltipStyle: object;
}) {
  // Transform data: group by month, with each equipment as a key
  const equipmentSet = new Set<string>();
  data.forEach((d) => equipmentSet.add(d[dataKey] as string));
  const topEquipment = Array.from(equipmentSet).slice(0, 5); // Top 5 only

  const monthMap = new Map<string, Record<string, number>>();
  data.forEach(({ month, count, ...rest }) => {
    const equipment = rest[dataKey] as string;
    if (!topEquipment.includes(equipment)) return;
    if (!monthMap.has(month)) {
      monthMap.set(month, {});
    }
    monthMap.get(month)![equipment] = count as number;
  });

  const chartData = Array.from(monthMap.entries())
    .map(([month, counts]) => ({ month, ...counts }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 25%)" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(0 0% 50%)" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50%)" />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {topEquipment.map((equipment, index) => (
          <Area
            key={equipment}
            type="monotone"
            dataKey={equipment}
            stackId="1"
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            fill={CHART_COLORS[index % CHART_COLORS.length]}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default StatsPage;
