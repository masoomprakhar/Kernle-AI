"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { labelOf } from "@/lib/utils";
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

type Category = {
  id: string;
  code: string;
  label?: unknown;
  parentId?: string | null;
  children?: Category[];
};

function flatten(nodes: Category[], depth = 0): Array<Category & { depth: number }> {
  const out: Array<Category & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

export default function CategoriesPage() {
  const [tree, setTree] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [parentId, setParentId] = useState<string>("root");
  const [moveId, setMoveId] = useState("");
  const [moveParent, setMoveParent] = useState("root");
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api<Category[]>("/pim/categories?tree=true");
      setTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const flat = flatten(tree);

  async function create() {
    try {
      await api("/pim/categories", {
        method: "POST",
        body: {
          code,
          label: { en_US: label || code },
          parentId: parentId === "root" ? undefined : parentId,
        },
      });
      setOpen(false);
      setCode("");
      setLabel("");
      setParentId("root");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function move() {
    if (!moveId) return;
    try {
      await api(`/pim/categories/${moveId}`, {
        method: "PATCH",
        body: { parentId: moveParent === "root" ? null : moveParent },
      });
      setMoveId("");
      setMoveParent("root");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Categories</h1>
          <p className="text-muted-foreground">Tree structure for merchandising and channel mapping.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New category</DialogTitle>
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
                <Label>Parent</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Root</SelectItem>
                    {flat.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {"—".repeat(c.depth)} {labelOf(c.label) || c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void create()} disabled={!code.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Category tree</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {flat.map((c) => (
            <div
              key={c.id}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              style={{ paddingLeft: 8 + c.depth * 16 }}
            >
              <span className="font-medium">{labelOf(c.label) || c.code}</span>
              <span className="ml-2 text-muted-foreground">{c.code}</span>
            </div>
          ))}
          {!flat.length && <p className="text-sm text-muted-foreground">No categories yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Move category</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={moveId} onValueChange={setMoveId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {flat.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {labelOf(c.label) || c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moveParent} onValueChange={setMoveParent}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="New parent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Root</SelectItem>
              {flat
                .filter((c) => c.id !== moveId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {labelOf(c.label) || c.code}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => void move()} disabled={!moveId}>
            Move
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
