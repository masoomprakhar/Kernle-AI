"use client";

import {
  clearAuth,
  getAccessToken,
  getOrgId,
  getRefreshToken,
  getWorkspaceId,
  setTokens,
} from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  formData?: FormData;
  skipOrg?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, formData, skipOrg = false, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);

  if (auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!skipOrg) {
      const org = getOrgId();
      const workspace = getWorkspaceId();
      if (org) headers.set("x-organization-id", org);
      if (workspace) headers.set("x-workspace-id", workspace);
    }
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  let res = await fetch(url, { ...rest, headers, body: payload });

  if (res.status === 401 && auth) {
    const ok = await tryRefresh();
    if (ok) {
      const token = getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      res = await fetch(url, { ...rest, headers, body: payload });
    } else {
      clearAuth();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? Array.isArray((data as { message: unknown }).message)
          ? ((data as { message: string[] }).message).join(", ")
          : String((data as { message: unknown }).message)
        : res.statusText || "Request failed";
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export { API_BASE };
