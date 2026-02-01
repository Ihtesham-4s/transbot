import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearAuth, loadAuth, saveAuth } from "../lib/authStorage";
import { getMe } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => loadAuth()?.token || null);
  const [user, setUser] = useState(() => loadAuth()?.user || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && user) saveAuth({ token, user });
    else if (!token && !user) clearAuth();
  }, [token, user]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!token) return;
      if (user) return;
      setLoading(true);
      try {
        const res = await getMe(token);
        if (!cancelled) setUser(res.user);
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthed: Boolean(token && user),
      setAuth: ({ token: t, user: u }) => {
        setToken(t);
        setUser(u);
      },
      logout: () => {
        setToken(null);
        setUser(null);
      }
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

