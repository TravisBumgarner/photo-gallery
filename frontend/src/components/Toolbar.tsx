import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import {
  Box,
  Breadcrumbs,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { PhotoFilters } from '@/types';
import { SPACING } from '@/styles/styleConsts';

interface ToolbarProps {
  filters: PhotoFilters;
  onFilterChange: (filters: Partial<PhotoFilters>) => void;
  columnCount: number;
  onColumnCountChange: (count: number) => void;
}

function Toolbar({
  filters,
  onFilterChange,
  columnCount,
  onColumnCountChange,
}: ToolbarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [folders, setFolders] = useState<string[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [modalBrowsePath, setModalBrowsePath] = useState('');

  useEffect(() => {
    fetch('/api/photos/meta', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setFolders(data.folders || []);
      })
      .catch((err) => console.error('Failed to fetch toolbar metadata:', err));
  }, []);

  const currentFolder = filters.folder || '';
  const breadcrumbs = currentFolder ? currentFolder.split('/') : [];

  const siblingsAtDepth = useMemo(() => {
    return breadcrumbs.map((_, index) => {
      const parentPath = breadcrumbs.slice(0, index).join('/');
      const parentPrefix = parentPath ? `${parentPath}/` : '';
      const siblingSet = new Set<string>();
      folders.forEach((path) => {
        if (parentPrefix ? path.startsWith(parentPrefix) : true) {
          const segments = path.split('/');
          if (segments.length > index) {
            siblingSet.add(segments[index]);
          }
        }
      });
      return Array.from(siblingSet).sort((a, b) => a.localeCompare(b));
    });
  }, [folders, breadcrumbs]);

  const children = useMemo(() => {
    const depth = breadcrumbs.length;
    const prefix = currentFolder ? `${currentFolder}/` : '';
    const childSet = new Set<string>();
    folders.forEach((path) => {
      if (prefix ? path.startsWith(prefix) : true) {
        const segments = path.split('/');
        if (segments.length > depth) {
          childSet.add(segments[depth]);
        }
      }
    });
    return Array.from(childSet).sort((a, b) => a.localeCompare(b));
  }, [folders, currentFolder, breadcrumbs.length]);

  // Compute children for the modal's browse path
  const modalBrowseSegments = modalBrowsePath ? modalBrowsePath.split('/') : [];
  const modalChildren = useMemo(() => {
    const depth = modalBrowseSegments.length;
    const prefix = modalBrowsePath ? `${modalBrowsePath}/` : '';
    const childSet = new Set<string>();
    folders.forEach((path) => {
      if (prefix ? path.startsWith(prefix) : true) {
        const segments = path.split('/');
        if (segments.length > depth) {
          childSet.add(segments[depth]);
        }
      }
    });
    return Array.from(childSet).sort((a, b) => a.localeCompare(b));
  }, [folders, modalBrowsePath, modalBrowseSegments.length]);

  // Check if the modal browse path itself is a valid folder (has photos directly)
  const modalBrowseIsFolder = useMemo(() => {
    if (!modalBrowsePath) return false;
    return folders.some((f) => f === modalBrowsePath || f.startsWith(modalBrowsePath + '/'));
  }, [folders, modalBrowsePath]);

  const handleOpenFolderModal = () => {
    setModalBrowsePath(currentFolder);
    setFolderModalOpen(true);
  };

  const handleSelectFolder = (folder: string) => {
    onFilterChange({ folder });
    setFolderModalOpen(false);
  };

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
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* Folder Browser — mobile: compact button, desktop: breadcrumbs */}
        {isMobile ? (
          <Button
            variant="text"
            startIcon={<FolderIcon />}
            onClick={handleOpenFolderModal}
            sx={{
              flex: 1,
              justifyContent: 'flex-start',
              textTransform: 'none',
              color: 'text.primary',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="body2"
              fontWeight="bold"
              noWrap
            >
              Browse
            </Typography>
          </Button>
        ) : (
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}
          >
            <FolderIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
            <Breadcrumbs
              separator="/"
              sx={{
                '& .MuiBreadcrumbs-separator': { mx: SPACING.SMALL.PX },
                '& .MuiBreadcrumbs-ol': { alignItems: 'center' },
                '& .MuiBreadcrumbs-li': { lineHeight: 1 },
              }}
            >
              <Link
                component="button"
                variant="body2"
                underline={currentFolder ? 'hover' : 'none'}
                color={currentFolder ? 'inherit' : 'primary'}
                fontWeight={currentFolder ? 'normal' : 'bold'}
                onClick={() => onFilterChange({ folder: '' })}
                sx={{ cursor: 'pointer', lineHeight: 1, fontSize: '13.33px', position: 'relative', fontWeight: 'bold', top: '-1px' }}
              >
                All
              </Link>
              {breadcrumbs.map((segment, index) => {
                const siblings = siblingsAtDepth[index] || [];
                const parentPath = breadcrumbs.slice(0, index).join('/');
                return (
                  <Select
                    key={index}
                    value={segment}
                    onChange={(e) => {
                      const picked = e.target.value as string;
                      if (picked === '__close__') {
                        const closeTo = breadcrumbs.slice(0, index).join('/');
                        onFilterChange({ folder: closeTo });
                      } else {
                        const newFolder = parentPath
                          ? `${parentPath}/${picked}`
                          : picked;
                        onFilterChange({ folder: newFolder });
                      }
                    }}
                    sx={{
                      '& .MuiSelect-select': {
                        fontWeight: 'bold',
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: { maxHeight: 300 },
                      },
                    }}
                  >
                    <MenuItem value="__close__" sx={{ fontStyle: 'italic' }}>
                      Close Folder
                    </MenuItem>
                    {siblings.map((sib) => (
                      <MenuItem key={sib} value={sib}>
                        {sib}
                      </MenuItem>
                    ))}
                  </Select>
                );
              })}
              {children.length > 0 && (
                <Select
                  value=""
                  displayEmpty
                  onChange={(e) => {
                    const child = e.target.value as string;
                    if (!child) return;
                    const newFolder = currentFolder
                      ? `${currentFolder}/${child}`
                      : child;
                    onFilterChange({ folder: newFolder });
                  }}
                  renderValue={() => 'Select folder\u2026'}
                  sx={{
                    '& .MuiSelect-select': {
                      fontWeight: 'bold',
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: { maxHeight: 300 },
                    },
                  }}
                >
                  {children.map((child) => (
                    <MenuItem key={child} value={child}>
                      {child}
                    </MenuItem>
                  ))}
                </Select>
              )}
            </Breadcrumbs>
          </Stack>
        )}

        {/* Row Count Control (hidden on mobile) */}
        {!isMobile && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{
            flexShrink: 0,
            paddingRight: '50px',
          }}>
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.max(1, columnCount - 1))}
              disabled={columnCount <= 1}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              sx={{ minWidth: 48, textAlign: 'center' }}
            >
              {columnCount} {columnCount === 1 ? 'Column' : 'Columns'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => onColumnCountChange(Math.min(8, columnCount + 1))}
              disabled={columnCount >= 8}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
      </Stack>

      {/* Mobile Folder Explorer Modal */}
      <Dialog
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        fullScreen
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography variant="h6" fontWeight="bold">Browse Folders</Typography>
          <IconButton onClick={() => setFolderModalOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {/* Current path breadcrumb */}
          <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography
                variant="body2"
                onClick={() => setModalBrowsePath('')}
                sx={{
                  cursor: 'pointer',
                  fontWeight: !modalBrowsePath ? 'bold' : 'normal',
                  color: !modalBrowsePath ? 'primary.main' : 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                }}
              >
                All
              </Typography>
              {modalBrowseSegments.map((segment, index) => (
                <Stack key={index} direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="body2" color="text.secondary">/</Typography>
                  <Typography
                    variant="body2"
                    onClick={() => setModalBrowsePath(modalBrowseSegments.slice(0, index + 1).join('/'))}
                    sx={{
                      cursor: 'pointer',
                      fontWeight: index === modalBrowseSegments.length - 1 ? 'bold' : 'normal',
                      color: index === modalBrowseSegments.length - 1 ? 'primary.main' : 'text.secondary',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    {segment}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Back button */}
          {modalBrowsePath && (
            <ListItemButton
              onClick={() => {
                const parent = modalBrowseSegments.slice(0, -1).join('/');
                setModalBrowsePath(parent);
              }}
              sx={{ py: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ArrowBackIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Back" />
            </ListItemButton>
          )}

          {/* Select current folder button */}
          {modalBrowseIsFolder && (
            <Box sx={{ px: 2, py: 1 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={() => handleSelectFolder(modalBrowsePath)}
                startIcon={<FolderOpenIcon />}
              >
                Select "{modalBrowseSegments[modalBrowseSegments.length - 1]}"
              </Button>
            </Box>
          )}

          {/* Select "All Folders" when at root */}
          {!modalBrowsePath && (
            <Box sx={{ px: 2, py: 1 }}>
              <Button
                variant={!currentFolder ? 'contained' : 'outlined'}
                fullWidth
                onClick={() => handleSelectFolder('')}
                startIcon={<FolderOpenIcon />}
              >
                All Folders
              </Button>
            </Box>
          )}

          {/* Child folders list */}
          <List disablePadding>
            {modalChildren.map((child) => {
              const childPath = modalBrowsePath ? `${modalBrowsePath}/${child}` : child;
              const isSelected = currentFolder === childPath;
              const hasSubfolders = folders.some((f) => f.startsWith(childPath + '/'));
              return (
                <ListItemButton
                  key={child}
                  onClick={() => {
                    if (hasSubfolders) {
                      setModalBrowsePath(childPath);
                    } else {
                      handleSelectFolder(childPath);
                    }
                  }}
                  selected={isSelected}
                  sx={{ py: 1.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FolderIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={child} />
                  {hasSubfolders ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFolder(childPath);
                        }}
                        sx={{
                          border: '1px solid',
                          borderColor: 'text.secondary',
                          borderRadius: 0.5,
                          p: 0.5,
                        }}
                      >
                        <CheckIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <ChevronRightIcon color="action" />
                    </Stack>
                  ) : isSelected ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  ) : null}
                </ListItemButton>
              );
            })}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default Toolbar;
