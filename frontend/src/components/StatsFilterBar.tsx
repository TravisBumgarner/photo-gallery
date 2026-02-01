import { Clear as ClearIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Rating,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { StatsFilters } from '@/types';

interface StatsFilterBarProps {
  filters: StatsFilters;
  onFilterChange: (filters: StatsFilters) => void;
}

interface Metadata {
  cameras: string[];
  lenses: string[];
  isoValues: number[];
  apertureValues: number[];
}

function StatsFilterBar({ filters, onFilterChange }: StatsFilterBarProps) {
  const [metadata, setMetadata] = useState<Metadata>({
    cameras: [],
    lenses: [],
    isoValues: [],
    apertureValues: [],
  });
  const [isoRange, setIsoRange] = useState<[number, number] | null>(null);
  const [apertureRange, setApertureRange] = useState<[number, number] | null>(
    null,
  );

  useEffect(() => {
    fetch('/api/photos/meta', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setMetadata({
          cameras: data.cameras || [],
          lenses: data.lenses || [],
          isoValues: data.isoValues || [],
          apertureValues: data.apertureValues || [],
        });
      })
      .catch((err) => console.error('Failed to fetch metadata:', err));
  }, []);

  const selectedCameras = filters.camera
    ? filters.camera.split(',').filter(Boolean)
    : [];
  const selectedLenses = filters.lens
    ? filters.lens.split(',').filter(Boolean)
    : [];

  const hasActiveFilters =
    !!filters.camera ||
    !!filters.lens ||
    !!filters.startDate ||
    !!filters.endDate ||
    filters.minIso !== undefined ||
    filters.maxIso !== undefined ||
    filters.minAperture !== undefined ||
    filters.maxAperture !== undefined ||
    filters.rating !== undefined;

  const handleClear = () => {
    onFilterChange({});
    setIsoRange(null);
    setApertureRange(null);
  };

  const isoMin = metadata.isoValues.length
    ? Math.min(...metadata.isoValues)
    : 0;
  const isoMax = metadata.isoValues.length
    ? Math.max(...metadata.isoValues)
    : 0;
  const apertureMin = metadata.apertureValues.length
    ? Math.min(...metadata.apertureValues)
    : 0;
  const apertureMax = metadata.apertureValues.length
    ? Math.max(...metadata.apertureValues)
    : 0;

  return (
    <Box
      sx={{
        p: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="flex-end"
        flexWrap="wrap"
        useFlexGap
        sx={{ rowGap: 1.5 }}
      >
        {/* Camera Multi-Select */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Camera</InputLabel>
          <Select
            multiple
            value={selectedCameras}
            onChange={(e) => {
              const value = e.target.value as string[];
              onFilterChange({
                ...filters,
                camera: value.length ? value.join(',') : undefined,
              });
            }}
            label="Camera"
            renderValue={(selected) =>
              selected.length === 1
                ? selected[0]
                : `${selected.length} cameras`
            }
          >
            {metadata.cameras.map((camera) => (
              <MenuItem key={camera} value={camera}>
                <Checkbox
                  checked={selectedCameras.includes(camera)}
                  size="small"
                />
                <ListItemText primary={camera} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Lens Multi-Select */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Lens</InputLabel>
          <Select
            multiple
            value={selectedLenses}
            onChange={(e) => {
              const value = e.target.value as string[];
              onFilterChange({
                ...filters,
                lens: value.length ? value.join(',') : undefined,
              });
            }}
            label="Lens"
            renderValue={(selected) =>
              selected.length === 1 ? selected[0] : `${selected.length} lenses`
            }
          >
            {metadata.lenses.map((lens) => (
              <MenuItem key={lens} value={lens}>
                <Checkbox
                  checked={selectedLenses.includes(lens)}
                  size="small"
                />
                <ListItemText primary={lens} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Date Range */}
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="From"
            type="date"
            size="small"
            value={filters.startDate || ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                startDate: e.target.value || undefined,
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 150 }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={filters.endDate || ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                endDate: e.target.value || undefined,
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 150 }}
          />
        </Stack>

        {/* ISO Range */}
        {metadata.isoValues.length > 1 && (
          <Box sx={{ minWidth: 140 }}>
            <Typography variant="caption" color="text.secondary">
              ISO
            </Typography>
            <Slider
              value={
                isoRange || [
                  filters.minIso ?? isoMin,
                  filters.maxIso ?? isoMax,
                ]
              }
              onChange={(_, newValue) => {
                setIsoRange(newValue as [number, number]);
              }}
              onChangeCommitted={(_, newValue) => {
                const [min, max] = newValue as number[];
                onFilterChange({
                  ...filters,
                  minIso: min === isoMin ? undefined : min,
                  maxIso: max === isoMax ? undefined : max,
                });
                setIsoRange(null);
              }}
              min={isoMin}
              max={isoMax}
              valueLabelDisplay="auto"
              size="small"
            />
          </Box>
        )}

        {/* Aperture Range */}
        {metadata.apertureValues.length > 1 && (
          <Box sx={{ minWidth: 140 }}>
            <Typography variant="caption" color="text.secondary">
              Aperture
            </Typography>
            <Slider
              value={
                apertureRange || [
                  filters.minAperture ?? apertureMin,
                  filters.maxAperture ?? apertureMax,
                ]
              }
              onChange={(_, newValue) => {
                setApertureRange(newValue as [number, number]);
              }}
              onChangeCommitted={(_, newValue) => {
                const [min, max] = newValue as number[];
                onFilterChange({
                  ...filters,
                  minAperture: min === apertureMin ? undefined : min,
                  maxAperture: max === apertureMax ? undefined : max,
                });
                setApertureRange(null);
              }}
              min={apertureMin}
              max={apertureMax}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `f/${value}`}
              size="small"
              step={0.1}
            />
          </Box>
        )}

        {/* Rating */}
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Min Rating
          </Typography>
          <Rating
            value={filters.rating || 0}
            onChange={(_, newValue) => {
              onFilterChange({
                ...filters,
                rating: newValue === 0 ? undefined : newValue || undefined,
              });
            }}
            size="small"
          />
        </Box>

        {/* Clear Button */}
        {hasActiveFilters && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            sx={{ flexShrink: 0 }}
          >
            Clear
          </Button>
        )}
      </Stack>
    </Box>
  );
}

export default StatsFilterBar;
