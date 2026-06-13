import { Menu as MenuIcon } from '@mui/icons-material';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  PhotoLibrary as PhotoIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function NavMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    setAnchorEl(null);
    navigate(path);
  };

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 1200,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        size="small"
      >
        <MenuIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          onClick={() => handleNav('/')}
          selected={location.pathname === '/'}
        >
          <ListItemIcon>
            <PhotoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Gallery</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleNav('/stats')}
          selected={location.pathname === '/stats'}
        >
          <ListItemIcon>
            <BarChartIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Stats</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default NavMenu;
