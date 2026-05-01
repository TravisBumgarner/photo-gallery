import {
  AutoAwesome as AutoAwesomeIcon,
  Clear as ClearIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Autocomplete,
  Box,
  CircularProgress,
  IconButton,
  ListSubheader,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onContentSearch?: (value: string) => void;
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

const CONTENT_OPTION_PREFIX = '✨ Content Search: ';

function SearchBar({ value, onChange, onContentSearch }: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<string[]>([]);
  const [groupedOptions, setGroupedOptions] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGrouped, setShowGrouped] = useState(false);

  // Sync input when parent updates `value` externally (e.g. filter chip clear).
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchGroupedSuggestions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/photos/suggestions', {
        credentials: 'include',
      });
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
      fetch(
        `/api/photos/autocomplete?query=${encodeURIComponent(inputValue)}`,
        { credentials: 'include' },
      )
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          setOptions(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch((err) => {
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

  // Build dropdown options. The "Content Search" pseudo-option is prepended
  // whenever the user has typed something and a content-search handler is wired.
  const baseOptions = showGrouped
    ? groupedOptions.flatMap((group) => group.options)
    : options;
  const contentOption =
    inputValue.length > 0 && onContentSearch
      ? `${CONTENT_OPTION_PREFIX}${inputValue}`
      : null;
  const allOptions = contentOption
    ? [contentOption, ...baseOptions]
    : baseOptions;

  const submitRegular = (text: string) => {
    onChange(text);
  };

  return (
    <Autocomplete
      freeSolo
      forcePopupIcon={false}
      disableClearable
      options={allOptions}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      onChange={(_, newValue) => {
        if (typeof newValue !== 'string') return;
        if (newValue.startsWith(CONTENT_OPTION_PREFIX) && onContentSearch) {
          const text = newValue.slice(CONTENT_OPTION_PREFIX.length);
          onContentSearch(text);
          return;
        }
        submitRegular(newValue);
      }}
      onFocus={() => {
        if (inputValue.length === 0) {
          fetchGroupedSuggestions();
        }
      }}
      loading={loading}
      sx={{ width: '100%' }}
      groupBy={
        showGrouped
          ? (option) => {
              for (const group of groupedOptions) {
                if (group.options.includes(option)) {
                  return group.title;
                }
              }
              return '';
            }
          : undefined
      }
      renderGroup={
        showGrouped
          ? (params) => (
              <li key={params.group}>
                <ListSubheader
                  component="div"
                  sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}
                >
                  {params.group}
                </ListSubheader>
                {params.children}
              </li>
            )
          : undefined
      }
      renderOption={(props, option) => {
        const isContent = option.startsWith(CONTENT_OPTION_PREFIX);
        return (
          <Box component="li" {...props}>
            {isContent ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'primary.main',
                }}
              >
                <AutoAwesomeIcon fontSize="small" />
                <Typography variant="body2" fontStyle="italic">
                  {option.slice(CONTENT_OPTION_PREFIX.length)}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2">{option}</Typography>
            )}
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search photos…"
          size="small"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {inputValue.length > 0 && (
                  <IconButton
                    size="small"
                    aria-label="Clear"
                    onClick={() => setInputValue('')}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  aria-label="Search"
                  onClick={() => submitRegular(inputValue)}
                  edge="end"
                >
                  <SearchIcon fontSize="small" />
                </IconButton>
              </>
            ),
          }}
        />
      )}
    />
  );
}

export default SearchBar;
