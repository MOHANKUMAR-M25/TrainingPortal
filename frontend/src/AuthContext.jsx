// ============================================================
// Auth context — handles the session for the whole app.
// - Admins: Google OAuth (backend redirects back with ?token=JWT)
// - Students: OTP sign-up/login (email + phone) issues a JWT too
// Only whitelisted admin emails receive isAdmin=true (edit rights).
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

  // Called after a student completes OTP verification
  const loginStudent = (token, student) => {
    setToken(token);
    setUser({
      email: student.email,
      name: student.name,
      phone: student.phone,
      isAdmin: false,
      isStudent: true
    });
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: Boolean(user?.isAdmin),
        isStudent: Boolean(user?.isStudent),
        checking,
        login,
        loginStudent,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
