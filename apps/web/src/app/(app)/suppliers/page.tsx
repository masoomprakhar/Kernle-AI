"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Supplier = {
  id: string;
  name: string;
  contactEmail?: string;
  portalToken?: string;
};

type ReviewItem = {
  id: string;
  status?: string;
  productSku?: string;
  submittedValues?: Record<string, unknown>;
  createdAt?: string;
  note?: string;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [s, q] = await Promise.all([
        api<Supplier[]>("/suppliers"),
        api<ReviewItem[]>("/suppliers/review/queue").catch(() => []),
      ]);
      setSuppliers(Array.isArray(s) ? s : []);
      setQueue(Array.isArray(q) ? q : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      await api("/suppliers", {
        method: "POST",
        body: { name, contactEmail: email || undefined },
      });
      setOpen(false);
      setName("");
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function review(id: string, action: "approve" | "reject") {
    try {
      await api(`/suppliers/review/${id}/${action}`, {
        method: "POST",
        body: { note: note || undefined },
      });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Suppliers</h1>
          <p className="text-muted-foreground">Portal partners and inbound content review.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contact email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void create()} disabled={!name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Suppliers</TabsTrigger>
          <TabsTrigger value="review">Review queue ({queue.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-2">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.contactEmail || "No email"}</p>
                </div>
                {s.portalToken && (
                  <Badge variant="outline" className="max-w-[280px] truncate font-mono text-[10px]">
                    /portal/{s.portalToken}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
          {!suppliers.length && <p className="text-sm text-muted-foreground">No suppliers yet.</p>}
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Textarea
            placeholder="Optional review note for approve/reject…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {queue.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-sans text-base">{item.productSku || item.id}</CardTitle>
                  <Badge variant="warning">{item.status || "pending"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(item.submittedValues || {}, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void review(item.id, "approve")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void review(item.id, "reject")}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!queue.length && <p className="text-sm text-muted-foreground">Review queue is empty.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
