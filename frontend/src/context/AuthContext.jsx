import { createContext, useContext, useEffect, useState } from "react";

import { authService } from "../services/authService";
import { DEMO_MODE } from "../config/env";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState(null);

  useEffect(() => {
    if (DEMO_MODE) {
      const storedUser = window.localStorage.getItem("timesheet_demo_user");
      setUser(storedUser ? JSON.parse(storedUser) : null);
      setAuthConfig({ app_name: "Team Timesheet", local_dev_auth: true, oidc_enabled: false });
      setIsLoading(false);
      return;
    }

    Promise.allSettled([
      authService.getCurrentUser(),
      authService.getConfig(),
    ]).then(([userResult, configResult]) => {
      if (userResult.status === "fulfilled") setUser(userResult.value);
      if (configResult.status === "fulfilled") setAuthConfig(configResult.value);
      setIsLoading(false);
    });
  }, []);

  async function logout() {
    if (!DEMO_MODE) await authService.logout();
    if (DEMO_MODE) window.localStorage.removeItem("timesheet_demo_user");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        logout,
        isLoading,
        authConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}