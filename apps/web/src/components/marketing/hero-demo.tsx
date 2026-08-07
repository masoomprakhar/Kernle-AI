"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PROMPTS = [
  "Which SKUs are blocking publish?",
  "What should I enrich today?",
  "Show incomplete Apparel records",
] as const;

const THREADS: Record<
  (typeof PROMPTS)[number],
  { who: "you" | "kernle"; text: string }[]
> = {
  "Which SKUs are blocking publish?": [
    { who: "you", text: "Which SKUs are blocking publish?" },
    {
      who: "kernle",
      text: "3 products are below channel readiness for Ecommerce · en_US.",
    },
    {
      who: "kernle",
      text: "Day Pack (48%) missing weight + material. Merino Jacket (71%) thin description. Trail Bottle (62%) missing packshot.",
    },
  ],
  "What should I enrich today?": [
    { who: "you", text: "What should I enrich today?" },
    {
      who: "kernle",
      text: "12 records have high-confidence AI drafts waiting for review.",
    },
    {
      who: "kernle",
      text: "Start with Merino Jacket — material, care, and short description are ready to accept.",
    },
  ],
  "Show incomplete Apparel records": [
    { who: "you", text: "Show incomplete Apparel records" },
    {
      who: "kernle",
      text: "8 Apparel products under 80% completeness.",
    },
    {
      who: "kernle",
      text: "Top impact: Merino Jacket, Softshell Vest, Linen Shirt — ranked by channel traffic.",
    },
  ],
};

const ROWS = [
  { name: "Air Runner", sku: "SNK-AIR-01", family: "Footwear", pct: 96, status: "Ready" },
  { name: "Merino Jacket", sku: "JKT-WOOL-12", family: "Apparel", pct: 71, status: "Review" },
  { name: "Day Pack", sku: "BAG-NYL-04", family: "Bags", pct: 48, status: "Blocked" },
  { name: "Trail Cap", sku: "HAT-TRL-09", family: "Accessories", pct: 88, status: "Ready" },
];

export function HeroDemo() {
  const [prompt, setPrompt] = useState<(typeof PROMPTS)[number]>(PROMPTS[0]);
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    setVisible(1);
    const total = THREADS[prompt].length;
    const timers: number[] = [];
    for (let i = 2; i <= total; i++) {
      timers.push(window.setTimeout(() => setVisible(i), (i - 1) * 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [prompt]);

  const messages = THREADS[prompt].slice(0, visible);

  return (
    <div className="mkt-stage overflow-hidden rounded-lg border border-hairline bg-canvas shadow-cta-soft">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-strong" />
          <span className="ml-2 text-[13px] font-medium text-ink">Catalog workspace</span>
        </div>
        <span className="rounded-pill bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Live demo
        </span>
      </div>

      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        <div className="border-b border-hairline p-4 md:p-5 lg:border-b-0 lg:border-r">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Ask Kernle
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrompt(item)}
                className={cn(
                  "rounded-pill bg-canvas px-3 py-1.5 text-[12px] font-medium text-body shadow-[0_1px_2px_rgba(24,29,38,0.06),0_4px_12px_rgba(24,29,38,0.06)] transition-[box-shadow,color]",
                  prompt === item
                    ? "text-ink shadow-[0_1px_2px_rgba(24,29,38,0.08),0_6px_16px_rgba(24,29,38,0.1)]"
                    : "hover:shadow-[0_1px_2px_rgba(24,29,38,0.08),0_6px_16px_rgba(24,29,38,0.1)]",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={`${prompt}-${i}`}
                className={cn(
                  "mkt-msg max-w-[92%] rounded-md bg-canvas px-3.5 py-2.5 text-[13px] leading-relaxed text-ink shadow-[0_1px_2px_rgba(24,29,38,0.06),0_4px_12px_rgba(24,29,38,0.08)]",
                  msg.who === "you" ? "ml-auto" : "",
                )}
              >
                {msg.who === "kernle" && (
                  <p className="mb-1 text-[11px] font-medium text-link">Kernle</p>
                )}
                {msg.text}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-soft/60 p-4 md:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">Channel readiness</p>
              <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] text-ink">
                Ecommerce · en_US
              </p>
            </div>
            <p className="font-display text-[36px] leading-none tracking-[-0.03em] text-link">72%</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-hairline bg-canvas">
            <div className="grid grid-cols-[1.3fr_0.7fr_0.5fr] gap-2 border-b border-hairline bg-surface-soft px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              <span>Product</span>
              <span>Family</span>
              <span>Score</span>
            </div>
            {ROWS.map((row) => (
              <div
                key={row.sku}
                className="grid grid-cols-[1.3fr_0.7fr_0.5fr] items-center gap-2 border-b border-hairline px-3 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{row.sku}</p>
                </div>
                <p className="truncate text-[12px] text-body">{row.family}</p>
                <div>
                  <p className="text-[12px] font-medium tabular-nums text-ink">{row.pct}%</p>
                  <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-surface-soft">
                    <div className="h-full rounded-full bg-link" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
