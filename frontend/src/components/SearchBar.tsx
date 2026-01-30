import { useState, useEffect } from 'react';
import {
    Autocomplete,
    TextField,
    CircularProgress,
    ListSubheader,
    Typography,
    Box
} from '@mui/material';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
}

interface GroupedSuggestions {
    cameras: string[];
    keywords: string[];
    files: string[];
}

interface OptionGroup {
    title: string;
    options: string[];
}

function SearchBar({ value, onChange }: SearchBarProps) {
    const [localValue, setLocalValue] = useState(value);
    const [inputValue, setInputValue] = useState('');
    const [options, setOptions] = useState<string[]>([]);
    const [groupedOptions, setGroupedOptions] = useState<OptionGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [showGrouped, setShowGrouped] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            onChange(localValue);
        }, 500);

        return () => clearTimeout(timer);
    }, [localValue, onChange]);

    // Fetch grouped suggestions on focus (when no input)
    const fetchGroupedSuggestions = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/photos/suggestions', { credentials: 'include' });
            const data: GroupedSuggestions = await response.json();

            const grouped: OptionGroup[] = [];
            if (data.cameras?.length) {
                grouped.push({ title: 'Cameras', options: data.cameras });
            }
            if (data.keywords?.length) {
                grouped.push({ title: 'Keywords', options: data.keywords });
            }
            if (data.files?.length) {
                grouped.push({ title: 'Recent Files', options: data.files });
            }

            setGroupedOptions(grouped);
            setShowGrouped(true);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch grouped suggestions:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (inputValue.length < 2) {
            setOptions([]);
            setShowGrouped(inputValue.length === 0);
            setLoading(false);
            return;
        }

        setShowGrouped(false);
        setLoading(true);
        const timer = setTimeout(() => {
            fetch(`/api/photos/autocomplete?query=${encodeURIComponent(inputValue)}`, { credentials: 'include' })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => {
                    setOptions(Array.isArray(data) ? data : []);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Failed to fetch autocomplete:', err);
                    setOptions([]);
                    setLoading(false);
                });
        }, 300);

        return () => {
            clearTimeout(timer);
            setLoading(false);
        };
    }, [inputValue]);

    // Flatten grouped options for Autocomplete
    const allOptions = showGrouped
        ? groupedOptions.flatMap(group => group.options)
        : options;

    return (
        <Autocomplete
            freeSolo
            options={allOptions}
            value={localValue}
            inputValue={inputValue}
            onInputChange={(_, newInputValue) => {
                setInputValue(newInputValue);
                setLocalValue(newInputValue);
            }}
            onChange={(_, newValue) => {
                if (typeof newValue === 'string') {
                    setLocalValue(newValue);
                }
            }}
            onFocus={() => {
                if (inputValue.length === 0) {
                    fetchGroupedSuggestions();
                }
            }}
            loading={loading}
            sx={{ width: '100%' }}
            groupBy={showGrouped ? (option) => {
                for (const group of groupedOptions) {
                    if (group.options.includes(option)) {
                        return group.title;
                    }
                }
                return '';
            } : undefined}
            renderGroup={showGrouped ? (params) => (
                <li key={params.group}>
                    <ListSubheader component="div" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>
                        {params.group}
                    </ListSubheader>
                    {params.children}
                </li>
            ) : undefined}
            renderOption={(props, option) => (
                <Box component="li" {...props}>
                    {showGrouped ? (
                        <Typography variant="body2">{option}</Typography>
                    ) : (
                        <Typography variant="body2">{option}</Typography>
                    )}
                </Box>
            )}
            renderInput={(params) => (
                <TextField
                    {...params}
                    placeholder="Search photos, camera, keywords..."
                    size="small"
                    InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                            <>
                                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                            </>
                        ),
                    }}
                />
            )}
        />
    );
}

export default SearchBar;
