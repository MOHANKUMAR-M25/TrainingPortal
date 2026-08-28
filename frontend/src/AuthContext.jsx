// ============================================================
// Auth context — handles Google OAuth session for the whole app.
// After Google login, the backend redirects back with ?token=JWT.
// Only meenupkc@gmail.com receives isAdmin=true (edit rights).
// ============================================================

import { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, clearToken, getToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 1. Capture ?token=... after Google OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const authError = params.get("auth_error");
    if (token) {
      setToken(token);
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (authError) {
      console.error("Google login failed:", authError);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // 2. Validate the current session
    if (getToken()) {
      api
        .me()
        .then((res) => setUser(res.user))
        .catch(() => clearToken())
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const login = () => {
    window.location.href = api.googleLoginUrl;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin: Boolean(user?.isAdmin), checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
