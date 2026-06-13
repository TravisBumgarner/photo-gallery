import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { apiFetch } from './api';

type AuthState = {
  isAuthenticated: boolean;
  loading: boolean;
  setAuthenticated: (value: boolean) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/auth/check')
      .then((res) => res.json())
      .then((data) => setIsAuthenticated(data.authenticated === true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // logout even if request fails
    }
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, loading, setAuthenticated: setIsAuthenticated, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
