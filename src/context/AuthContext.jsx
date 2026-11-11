import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const AuthContext = createContext(null);

/**
 * The session lives in an HttpOnly cookie, so the browser cannot read it.
 * On boot we ask the server who we are; login/signup responses also update
 * local state immediately so the UI does not flicker.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data?.authenticated ? data : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const teacherSignup = useCallback(async (body) => {
    const data = await api.teacherSignup(body);
    setUser({ authenticated: true, role: "teacher", teacher: data.teacher });
    return data;
  }, []);

  const teacherLogin = useCallback(async (body) => {
    const data = await api.teacherLogin(body);
    setUser({ authenticated: true, role: "teacher", teacher: data.teacher });
    return data;
  }, []);

  const studentLogin = useCallback(async (body) => {
    const data = await api.studentLogin(body);
    setUser({
      authenticated: true,
      role: "student",
      student: data.student,
      class: data.class,
    });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, teacherSignup, teacherLogin, studentLogin, logout }),
    [user, loading, refresh, teacherSignup, teacherLogin, studentLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
