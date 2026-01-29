import { Box, Stack, Chip, Select, MenuItem, FormControl, IconButton, Typography } from '@mui/material';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
import { PhotoFilters } from '../types';
import SearchBar from './SearchBar';

interface ToolbarProps {
    filters: PhotoFilters;
    onFilterChange: (filters: Partial<PhotoFilters>) => void;
    columnCount: number;
    onColumnCountChange: (count: number) => void;
}

function Toolbar({ filters, onFilterChange, columnCount, onColumnCountChange }: ToolbarProps) {
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
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                {/* Search Bar */}
                <Box sx={{ minWidth: 300, flexGrow: 1, maxWidth: 500 }}>
                    <SearchBar
                        value={filters.search || ''}
                        onChange={(search) => onFilterChange({ search })}
                    />
                </Box>

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
                    <Typography variant="body2" sx={{ minWidth: 16, textAlign: 'center' }}>
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
            </Stack>
        </Box>
    );
}

export default Toolbar;
