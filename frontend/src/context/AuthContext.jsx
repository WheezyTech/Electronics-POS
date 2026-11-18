
import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const response = await api.get("/auth/users/me/");
      setUser(response.data.user ?? response.data);
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/auth/login/", {
      email,
      password,
    });

    const access = response.data.access;
    const refresh = response.data.refresh;

    if (!access || !refresh) {
      throw new Error("Login response did not contain JWT tokens.");
    }

    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);

    const profile = await api.get("/auth/users/me/");
    setUser(profile.data.user ?? profile.data);

    return profile.data;
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
