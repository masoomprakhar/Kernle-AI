"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "What problems does Kernle AI actually solve?",
    a: "Most teams do not have a product data tool. They have a spreadsheet, an ERP export, a shared drive of images, and a lot of manual copy-pasting between them. Kernle AI replaces that patchwork with a single system where product data is created once, enriched once, and distributed everywhere, so your team spends less time reconciling and more time launching.",
  },
  {
    q: "How does Kernle AI help with AI search and AI shopping assistants?",
    a: "AI tools can only recommend products they can accurately understand. Kernle structures your product data (attributes, specs, descriptions, and media) into a format readable by both people and machines, and scores each product on how well prepared it is for AI-driven discovery. The better structured your data, the more likely AI tools are to surface and correctly describe your products.",
  },
  {
    q: "What kind of companies use Kernle AI?",
    a: "Kernle AI is built for teams managing catalogs that have outgrown spreadsheets, typically a few hundred SKUs and up, across retail, fashion, manufacturing, consumer goods, and B2B distribution. If you sell through more than one channel, or work with suppliers who send product data in inconsistent formats, Kernle is built for you.",
  },
  {
    q: "Does Kernle AI replace our ERP or eCommerce platform?",
    a: "No. It sits between them. Kernle pulls raw product data in from ERPs, spreadsheets, or suppliers, and pushes clean, validated, enriched data out to your storefronts and marketplaces. It is the layer that makes sure everything downstream gets accurate, complete information.",
  },
  {
    q: "How does the AI enrichment actually work?",
    a: "Kernle's AI suggestions are grounded in your own product data and images. It drafts from what you already have rather than inventing specs. Every suggestion shows a confidence level and requires a person to review and approve it before it is saved. Nothing publishes automatically.",
  },
  {
    q: "Can we try it before committing?",
    a: "Yes. You can start on a free plan with a limited number of SKUs to explore the core catalog, asset library, and AI enrichment tools before upgrading.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="border-t border-hairline">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-8 py-6 text-left"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span className="text-title-sm text-ink">{item.q}</span>
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline text-muted-foreground",
                  isOpen && "border-ink text-ink",
                )}
              >
                {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-7 text-[15px] leading-[1.65] text-body">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
      <div className="border-t border-hairline" />
    </div>
  );
}
