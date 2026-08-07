"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Channel = {
  id: string;
  code: string;
  label: string;
  connectorType?: string;
  activationStatus?: string;
  paused?: boolean;
  locales?: string[];
};

type Dash = {
  channels?: Array<{
    channelId: string;
    ready?: number;
    notReady?: number;
    lastSyncAt?: string;
    status?: string;
  }>;
  recentLogs?: Array<{ id: string; channelId?: string; status?: string; message?: string; createdAt?: string }>;
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dash, setDash] = useState<Dash | null>(null);
  const [readiness, setReadiness] = useState<Record<string, unknown>>({});
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [connectorType, setConnectorType] = useState("shopify");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const [c, d] = await Promise.all([
        api<Channel[]>("/pim/channels"),
        api<Dash>("/syndication/dashboard").catch(() => null),
      ]);
      setChannels(Array.isArray(c) ? c : []);
      setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      await api("/pim/channels", {
        method: "POST",
        body: { code, label, connectorType, locales: ["en_US"] },
      });
      setOpen(false);
      setCode("");
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function checkReadiness(channelId: string) {
    try {
      const res = await api(`/syndication/channels/${channelId}/readiness`);
      setReadiness((r) => ({ ...r, [channelId]: res }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Readiness check failed");
    }
  }

  async function sync(channelId: string) {
    setMessage("");
    try {
      await api(`/syndication/channels/${channelId}/sync`, { method: "POST", body: {} });
      setMessage("Sync enqueued");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Channels</h1>
          <p className="text-muted-foreground">Syndication targets, readiness, and sync status.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Connector</Label>
                <Select value={connectorType} onValueChange={setConnectorType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopify">Shopify</SelectItem>
                    <SelectItem value="bigcommerce">BigCommerce</SelectItem>
                    <SelectItem value="amazon">Amazon</SelectItem>
                    <SelectItem value="walmart">Walmart</SelectItem>
                    <SelectItem value="generic_api">Generic API</SelectItem>
                    <SelectItem value="print">Print</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void create()} disabled={!code.trim() || !label.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <div className="space-y-3">
        {channels.map((ch) => {
          const stats = dash?.channels?.find((x) => x.channelId === ch.id);
          return (
            <Card key={ch.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div>
                  <CardTitle className="font-sans text-base">{ch.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {ch.code} · {ch.connectorType || "connector"}
                  </p>
                </div>
                <Badge variant={ch.paused ? "warning" : "success"}>
                  {ch.paused ? "Paused" : ch.activationStatus || "active"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>Ready: {stats?.ready ?? "—"}</span>
                  <span>Not ready: {stats?.notReady ?? "—"}</span>
                  <span>Last sync: {formatDate(stats?.lastSyncAt)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void checkReadiness(ch.id)}>
                    Check readiness
                  </Button>
                  <Button size="sm" onClick={() => void sync(ch.id)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync
                  </Button>
                </div>
                {readiness[ch.id] != null && (
                  <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(readiness[ch.id], null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!channels.length && <p className="text-sm text-muted-foreground">No channels configured.</p>}
      </div>

      {!!dash?.recentLogs?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base">Recent syndication logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.recentLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{log.message || log.status}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
