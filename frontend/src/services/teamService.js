import { apiClient } from "../lib/apiClient";

export const teamService = {
  getMine: () => apiClient.get("/teams/mine"),
  getManaged: () => apiClient.get("/teams/managed"),
  getMembers: (teamId) => apiClient.get(`/teams/${teamId}/members`),
  getAll: () => apiClient.get("/admin/teams"),
  create: (name) => apiClient.post("/admin/teams", { name }),
  rename: (teamId, name) => apiClient.patch(`/admin/teams/${teamId}`, { name }),
  remove: (teamId) => apiClient.delete(`/admin/teams/${teamId}`),
};
