
import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { getDeviceIdentity } from "../api/deviceIdentity";
import {
  checkCashierPin,
  hasCashierPin,
  saveCashierPin,
} from "../api/cashierPin";
import { syncPendingSales } from "../api/offlineSales";

const AuthContext = createContext(null);
const CACHED_PROFILE_KEY = "cached_user_profile";
const PIN_ATTEMPTS_LIMIT = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

function getCachedOfflineProfile() {
  const cachedProfile = localStorage.getItem(CACHED_PROFILE_KEY);
  const refreshToken = localStorage.getItem("refresh_token");
  const deviceSyncId = localStorage.getItem("device_sync_id");
  if (!cachedProfile || !refreshToken || !deviceSyncId) return null;

  try {
    const tokenParts = refreshToken.split(".");
    if (tokenParts.length !== 3) return null;
    const base64Payload = tokenParts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(tokenParts[1].length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(base64Payload));
    if (
      Number(payload.exp) * 1000 <= Date.now() ||
      payload.device_sync_id !== deviceSyncId
    ) {
      return null;
    }

    return JSON.parse(cachedProfile);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() =>
    Boolean(localStorage.getItem("access_token"))
  );
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isLocked, setIsLocked] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(false);

  const loadUser = async ({ restorePinLock = false } = {}) => {
    try {
      const response = await api.get("/auth/users/me/");
      const profile = response.data.user ?? response.data;
      localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
      setUser(profile);
      const hasPin = profile.role === "CASHIER" && hasCashierPin(profile.id);
      setPinConfigured(hasPin);
      if (restorePinLock) setIsLocked(hasPin);
      setIsOffline(false);
    } catch (error) {
      if (!error.response) {
        const cachedProfile = getCachedOfflineProfile();
        if (cachedProfile) {
          setUser(cachedProfile);
          const hasPin = (
            cachedProfile.role === "CASHIER" &&
            hasCashierPin(cachedProfile.id)
          );
          setPinConfigured(hasPin);
          if (restorePinLock) setIsLocked(hasPin);
          setIsOffline(true);
          return;
        }
        setIsOffline(true);
        setUser(null);
        return;
      }

      if ([401, 403].includes(error.response.status)) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem(CACHED_PROFILE_KEY);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      Promise.resolve().then(() => loadUser({ restorePinLock: true }));
    }
  }, []);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => {
      setIsOffline(false);
      if (localStorage.getItem("access_token")) {
        loadUser();
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const sync = () => {
      syncPendingSales(api).catch((error) => {
        console.error("Offline sale synchronization could not run.", error);
      });
    };

    window.addEventListener("online", sync);
    sync();
    return () => window.removeEventListener("online", sync);
  }, [user]);

  const login = async (username, password) => {
    const response = await api.post("/auth/login/", {
      username,
      password,
      ...getDeviceIdentity(),
    });

    const access = response.data.access;
    const refresh = response.data.refresh;

    if (!access || !refresh) {
      throw new Error("Login response did not contain JWT tokens.");
    }

    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);

    const userProfile = {
      ...response.data.user,
      offline_authorizations: response.data.offline_authorizations || [],
    };
    localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(userProfile));
    setUser(userProfile);
    setPinConfigured(
      userProfile.role === "CASHIER" && hasCashierPin(userProfile.id)
    );
    setIsLocked(false);
    setIsOffline(false);

    return response.data;
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem(CACHED_PROFILE_KEY);
    setUser(null);
    setIsLocked(false);
    setPinConfigured(false);
    window.location.href = "/login";
  };

  const configureCashierPin = async (pin) => {
    if (!user || user.role !== "CASHIER") {
      throw new Error("Only cashier accounts can configure a quick PIN.");
    }
    await saveCashierPin(user.id, pin);
    setPinConfigured(true);
  };

  const lockSession = () => {
    if (pinConfigured) setIsLocked(true);
  };

  const unlockWithPin = async (pin) => {
    if (!user || !pinConfigured) return { success: false };

    const attemptsKey = `cashier_pin_attempts:${getDeviceIdentity().device_sync_id}:${user.id}`;
    const attemptState = JSON.parse(localStorage.getItem(attemptsKey) || "{}");
    const lockedUntil = Number(attemptState.lockedUntil || 0);
    if (lockedUntil > Date.now()) {
      return { success: false, lockedUntil };
    }

    const validPin = await checkCashierPin(user.id, pin);
    if (validPin) {
      localStorage.removeItem(attemptsKey);
      setIsLocked(false);
      return { success: true };
    }

    const attempts = lockedUntil
      ? 1
      : Number(attemptState.attempts || 0) + 1;
    const nextState = attempts >= PIN_ATTEMPTS_LIMIT
      ? { attempts: 0, lockedUntil: Date.now() + PIN_LOCKOUT_MS }
      : { attempts, lockedUntil: 0 };
    localStorage.setItem(attemptsKey, JSON.stringify(nextState));
    return {
      success: false,
      lockedUntil: nextState.lockedUntil || 0,
    };
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isOffline,
      isLocked,
      pinConfigured,
      login,
      logout,
      configureCashierPin,
      lockSession,
      unlockWithPin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
