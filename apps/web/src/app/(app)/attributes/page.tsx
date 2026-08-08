"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { labelOf } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";

type Attribute = {
  id: string;
  code: string;
  type: string;
  label?: unknown;
  localizable?: boolean;
  scopable?: boolean;
  archived?: boolean;
};

const TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "select",
  "multiselect",
  "price",
  "media",
  "metric",
];

type MappingRow = { oldValue: string; canonicalValue: string };

export default function AttributesPage() {
  const [items, setItems] = useState<Attribute[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Attribute | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [localizable, setLocalizable] = useState(false);
  const [scopable, setScopable] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [canonOpen, setCanonOpen] = useState(false);
  const [canonAttr, setCanonAttr] = useState<Attribute | null>(null);
  const [mapping, setMapping] = useState<MappingRow[]>([]);
  const [canonBusy, setCanonBusy] = useState(false);

  async function load() {
    try {
      const data = await api<Attribute[]>("/pim/attributes");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEdit(null);
    setCode("");
    setLabel("");
    setType("text");
    setLocalizable(false);
    setScopable(false);
    setOpen(true);
  }

  function openEdit(a: Attribute) {
    setEdit(a);
    setCode(a.code);
    setLabel(labelOf(a.label));
    setType(a.type);
    setLocalizable(!!a.localizable);
    setScopable(!!a.scopable);
    setOpen(true);
  }

  async function save() {
    try {
      if (edit) {
        await api(`/pim/attributes/${edit.id}`, {
          method: "PATCH",
          body: {
            label: { en_US: label || code },
            localizable,
            scopable,
          },
        });
      } else {
        await api("/pim/attributes", {
          method: "POST",
          body: {
            code,
            type,
            label: { en_US: label || code },
            localizable,
            scopable,
          },
        });
      }
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function openCanonicalize(a: Attribute) {
    setError("");
    setInfo("");
    setCanonBusy(true);
    setCanonAttr(a);
    try {
      const res = await api<{ mapping: MappingRow[] }>(
        `/ai/attributes/${a.id}/canonicalize/propose`,
        { method: "POST" },
      );
      setMapping(res.mapping || []);
      setCanonOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propose failed");
    } finally {
      setCanonBusy(false);
    }
  }

  async function applyCanonicalize() {
    if (!canonAttr) return;
    setCanonBusy(true);
    setError("");
    try {
      const res = await api<{ updatedProducts: number }>(
        `/ai/attributes/${canonAttr.id}/canonicalize/apply`,
        { method: "POST", body: { mapping, updateAttributeOptions: true } },
      );
      setInfo(`Applied canonical mapping to ${res.updatedProducts} products`);
      setCanonOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setCanonBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Attributes</h1>
          <p className="text-muted-foreground">Define the fields that describe your products.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New attribute
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{edit ? "Edit attribute" : "Create attribute"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!edit && (
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              {!edit && (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Localizable</Label>
                <Switch checked={localizable} onCheckedChange={setLocalizable} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Scopable</Label>
                <Switch checked={scopable} onCheckedChange={setScopable} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void save()} disabled={!edit && !code.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}

      <div className="space-y-2">
        {items.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{labelOf(a.label) || a.code}</p>
                <p className="text-xs text-muted-foreground">{a.code}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{a.type}</Badge>
                {a.localizable && <Badge variant="secondary">locale</Badge>}
                {a.scopable && <Badge variant="secondary">scope</Badge>}
                {["select", "multiselect", "text"].includes(a.type) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={canonBusy}
                    onClick={() => void openCanonicalize(a)}
                  >
                    Canonicalize
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">No attributes yet.</p>}
      </div>

      <Dialog open={canonOpen} onOpenChange={setCanonOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Propose canonical options{canonAttr ? ` — ${canonAttr.code}` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Review the old → canonical mapping. Nothing is applied until you confirm.
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {mapping.map((row, i) => (
              <div key={`${row.oldValue}-${i}`} className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded border px-2 py-1.5 text-muted-foreground">{row.oldValue}</div>
                <Input
                  value={row.canonicalValue}
                  onChange={(e) => {
                    const next = [...mapping];
                    next[i] = { ...row, canonicalValue: e.target.value };
                    setMapping(next);
                  }}
                />
              </div>
            ))}
            {!mapping.length && (
              <p className="text-sm text-muted-foreground">No values found to canonicalize.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCanonOpen(false)}>
              Cancel
            </Button>
            <Button disabled={canonBusy || !mapping.length} onClick={() => void applyCanonicalize()}>
              Apply mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
