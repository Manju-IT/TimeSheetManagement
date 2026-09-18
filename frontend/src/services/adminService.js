import { apiClient } from "../lib/apiClient";

export const adminService = {
  listUsers: ({ page = 1, pageSize = 20, query = "", status = "" } = {}) => {
    const params = new URLSearchParams({ page, page_size: pageSize });
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    return apiClient.get(`/admin/users?${params}`);
  },
  updateUser: (userId, payload) => apiClient.patch(`/admin/users/${userId}`, payload),
  grantRole: (userId, role) => apiClient.post(`/admin/users/${userId}/roles`, { role }),
  revokeRole: (userId, role) => apiClient.delete(`/admin/users/${userId}/roles/${role}`),
  listAuditLogs: ({ page = 1, pageSize = 20 } = {}) =>
    apiClient.get(`/admin/audit-logs?page=${page}&page_size=${pageSize}`),
};
