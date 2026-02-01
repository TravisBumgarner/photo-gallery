import { BarChart as BarChartIcon } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

function StatsPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <BarChartIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
      <Typography variant="h4" color="text.secondary">
        Stats
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Photo statistics and charts coming soon.
      </Typography>
    </Box>
  );
}

export default StatsPage;
