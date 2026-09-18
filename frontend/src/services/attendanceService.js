import { apiClient } from "../lib/apiClient";

function locationPayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    geo_permission: "granted",
    client_reported_at: new Date().toISOString(),
    device_id: navigator.userAgent,
  };
}

export const attendanceService = {
  getToday: () => apiClient.get("/attendance/today"),
  getEvents: (limit = 50) => apiClient.get(`/attendance/events?limit=${limit}`),
  getSessions: (limit = 50) => apiClient.get(`/attendance/sessions?limit=${limit}`),
  checkIn: (position) => apiClient.post("/attendance/check-in", locationPayload(position)),
  checkOut: (position) => apiClient.post("/attendance/check-out", locationPayload(position)),
};
