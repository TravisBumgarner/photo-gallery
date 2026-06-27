import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { apiFetch } from './api';
import { getServerUrl, loadServerUrl } from './serverUrl';

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
    // Hydrate the saved server URL before checking auth — apiFetch reads it
    // synchronously, so it must be in place first. With no server configured
    // yet (fresh install) there's nothing to check; drop straight to the login
    // screen, where the user enters the address + password.
    loadServerUrl()
      .then(() => {
        if (!getServerUrl()) {
          setIsAuthenticated(false);
          return;
        }
        return apiFetch('/api/auth/check')
          .then((res) => res.json())
          .then((data) => setIsAuthenticated(data.authenticated === true))
          .catch(() => setIsAuthenticated(false));
      })
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
      value={{
        isAuthenticated,
        loading,
        setAuthenticated: setIsAuthenticated,
        logout,
      }}
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
