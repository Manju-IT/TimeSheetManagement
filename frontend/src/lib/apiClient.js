import { API_BASE_URL } from "../config/env";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      error?.message || `Request failed with status ${response.status}`,
      response.status,
      error?.details,
    );
  }

  return body;
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, {
    ...options,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  patch: (path, body, options) => request(path, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
  }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
