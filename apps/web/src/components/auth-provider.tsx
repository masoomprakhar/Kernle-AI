"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import {
  AuthUser,
  clearAuth,
  getAccessToken,
  getOrgId,
  getWorkspaceId,
  setOrgContext,
  setTokens,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  orgId: string | null;
  workspaceId: string | null;
  refreshUser: () => Promise<AuthUser | null>;
  loginWithTokens: (
    accessToken: string,
    refreshToken: string,
    memberships?: AuthUser["memberships"],
    workspaces?: AuthUser["workspaces"],
  ) => Promise<AuthUser | null>;
  logout: () => void;
  selectOrg: (organizationId: string, workspaceId?: string | null) => void;
  selectWorkspace: (workspaceId: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api<AuthUser>("/auth/me", { skipOrg: true });
      setUser(me);
      const storedOrg = getOrgId();
      const membership =
        me.memberships.find((m) => m.organizationId === storedOrg) || me.memberships[0];
      if (membership) {
        const ws =
          me.workspaces.find(
            (w) =>
              w.organizationId === membership.organizationId &&
              (w.id === getWorkspaceId() || !getWorkspaceId()),
          ) || me.workspaces.find((w) => w.organizationId === membership.organizationId);
        setOrgContext(membership.organizationId, ws?.id);
        setOrgId(membership.organizationId);
        setWorkspaceId(ws?.id || null);
      }
      return me;
    } catch {
      clearAuth();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrgId(getOrgId());
    setWorkspaceId(getWorkspaceId());
    void refreshUser();
  }, [refreshUser]);

  const loginWithTokens = useCallback(
    async (
      accessToken: string,
      refreshToken: string,
      memberships?: AuthUser["memberships"],
      workspaces?: AuthUser["workspaces"],
    ) => {
      setTokens(accessToken, refreshToken);
      if (memberships?.[0]) {
        const org = memberships[0].organizationId;
        const ws = workspaces?.find((w) => w.organizationId === org);
        setOrgContext(org, ws?.id);
        setOrgId(org);
        setWorkspaceId(ws?.id || null);
      }
      return refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setOrgId(null);
    setWorkspaceId(null);
  }, []);

  const selectOrg = useCallback(
    (organizationId: string, nextWorkspaceId?: string | null) => {
      const ws =
        nextWorkspaceId ??
        user?.workspaces.find((w) => w.organizationId === organizationId)?.id ??
        null;
      setOrgContext(organizationId, ws);
      setOrgId(organizationId);
      setWorkspaceId(ws);
    },
    [user],
  );

  const selectWorkspace = useCallback(
    (id: string) => {
      const org = orgId || getOrgId();
      if (!org) return;
      setOrgContext(org, id);
      setWorkspaceId(id);
    },
    [orgId],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      orgId,
      workspaceId,
      refreshUser,
      loginWithTokens,
      logout,
      selectOrg,
      selectWorkspace,
    }),
    [
      user,
      loading,
      orgId,
      workspaceId,
      refreshUser,
      loginWithTokens,
      logout,
      selectOrg,
      selectWorkspace,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
