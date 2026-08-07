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

type Attribute = { id: string; code: string; label?: unknown };
type Family = {
  id: string;
  code: string;
  label?: unknown;
  attributes?: Array<{ attributeId: string; attribute?: Attribute }>;
  _count?: { attributes?: number };
};

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [selected, setSelected] = useState<Family | null>(null);
  const [selectedAttrIds, setSelectedAttrIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const [f, a] = await Promise.all([
        api<Family[]>("/pim/families"),
        api<Attribute[]>("/pim/attributes"),
      ]);
      setFamilies(Array.isArray(f) ? f : []);
      setAttributes(Array.isArray(a) ? a : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openFamily(id: string) {
    setMessage("");
    try {
      const fam = await api<Family>(`/pim/families/${id}`);
      setSelected(fam);
      setSelectedAttrIds(new Set((fam.attributes || []).map((x) => x.attributeId || x.attribute?.id || "")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load family");
    }
  }

  async function createFamily() {
    try {
      const fam = await api<Family>("/pim/families", {
        method: "POST",
        body: { code, label: { en_US: label || code } },
      });
      setOpen(false);
      setCode("");
      setLabel("");
      await load();
      await openFamily(fam.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function saveBuilder() {
    if (!selected) return;
    try {
      await api(`/pim/families/${selected.id}`, {
        method: "PUT",
        body: {
          attributes: Array.from(selectedAttrIds).map((attributeId, i) => ({
            attributeId,
            sortOrder: i,
          })),
        },
      });
      setMessage("Family attributes saved");
      await load();
      await openFamily(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Families</h1>
          <p className="text-muted-foreground">Group attributes into product templates.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New family
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create family</DialogTitle>
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
            </div>
            <DialogFooter>
              <Button onClick={() => void createFamily()} disabled={!code.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base">Families</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => void openFamily(f.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${
                  selected?.id === f.id ? "bg-muted" : ""
                }`}
              >
                <span>{labelOf(f.label) || f.code}</span>
                <span className="text-xs text-muted-foreground">
                  {f.attributes?.length ?? f._count?.attributes ?? ""}
                </span>
              </button>
            ))}
            {!families.length && <p className="text-sm text-muted-foreground">No families yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-sans text-base">
              {selected ? `Builder · ${labelOf(selected.label) || selected.code}` : "Select a family"}
            </CardTitle>
            {selected && (
              <Button size="sm" onClick={() => void saveBuilder()}>
                Save assignments
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {!selected && (
              <p className="text-sm text-muted-foreground">Choose a family to assign attributes.</p>
            )}
            {selected &&
              attributes.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selectedAttrIds.has(a.id)}
                    onChange={(e) => {
                      setSelectedAttrIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      });
                    }}
                  />
                  <span className="font-medium">{labelOf(a.label) || a.code}</span>
                  <span className="text-muted-foreground">{a.code}</span>
                </label>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
