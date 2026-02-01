import { Box, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GalleryPage from '@/components/GalleryPage';
import LoginPage from '@/components/LoginPage';
import StatsPage from '@/components/StatsPage';
import AppThemeProvider from '@/styles/Theme';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated === true);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // logout even if request fails
    }
    setIsAuthenticated(false);
  };

  if (authLoading) {
    return (
      <AppThemeProvider>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
          <CircularProgress />
        </Box>
      </AppThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppThemeProvider>
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      </AppThemeProvider>
    );
  }

  return (
    <AppThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GalleryPage onLogout={handleLogout} />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppThemeProvider>
  );
}

export default App;
