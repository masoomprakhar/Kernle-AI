import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function labelOf(label: unknown, locale = "en_US"): string {
  if (!label) return "";
  if (typeof label === "string") return label;
  if (typeof label === "object" && label !== null) {
    const map = label as Record<string, string>;
    return map[locale] || map.en_US || map.en || Object.values(map)[0] || "";
  }
  return String(label);
}

export function formatPercent(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
