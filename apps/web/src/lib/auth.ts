"use client";

export const AUTH_KEYS = {
  access: "kernle_access",
  refresh: "kernle_refresh",
  org: "kernle_org",
  workspace: "kernle_workspace",
} as const;

export type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  onboardingDone: boolean;
  plan?: string;
};

export type Workspace = {
  id: string;
  name: string;
  organizationId: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  memberships: Membership[];
  workspaces: Workspace[];
};

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEYS.access);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEYS.refresh);
}

export function getOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEYS.org);
}

export function getWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEYS.workspace);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(AUTH_KEYS.access, accessToken);
  localStorage.setItem(AUTH_KEYS.refresh, refreshToken);
}

export function setOrgContext(organizationId: string, workspaceId?: string | null) {
  localStorage.setItem(AUTH_KEYS.org, organizationId);
  if (workspaceId) localStorage.setItem(AUTH_KEYS.workspace, workspaceId);
  else localStorage.removeItem(AUTH_KEYS.workspace);
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEYS.access);
  localStorage.removeItem(AUTH_KEYS.refresh);
  localStorage.removeItem(AUTH_KEYS.org);
  localStorage.removeItem(AUTH_KEYS.workspace);
}

export function isLoggedIn() {
  return !!getAccessToken();
}
