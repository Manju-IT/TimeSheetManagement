import { apiClient } from "../lib/apiClient";

export const authService = {
  getConfig: () => apiClient.get("/auth/config"),
  getCurrentUser: () => apiClient.get("/auth/me"),
  startLogin: (returnTo = window.location.origin) =>
    apiClient.post(`/auth/login?return_to=${encodeURIComponent(returnTo)}`),
  devLogin: (email) => apiClient.post("/auth/dev-login", { email }),
  logout: () => apiClient.post("/auth/logout"),
};
