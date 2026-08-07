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
                <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">No attributes yet.</p>}
      </div>
    </div>
  );
}
