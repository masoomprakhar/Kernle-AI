# Industrial Enrichment Demo (Unilog-style)

Judge-facing walkthrough for Kernle’s Accept-gated industrial enrichment pipeline. Customer UI copy says **Industrial enrichment** — not Unilog/Akeneo.

## What it demonstrates

```
Sample Input CSV (messy Part_Desc)
  → placeholders stripped
  → brand / manufacturer resolve (synthetic master)
  → classpath + Dept/Class/Fine
  → LOV + UOM attribute extract
  → multi-format descriptions
  → 252-column Delivery Format row (frozen headers)
  → Accept-gated PIM suggestions (never auto-commit)
  → eval vs faucet/fitting GT + golden dishwasher + sample subset
  → CSV export with Expected Output headers only
```

### Depth priorities

1. **Built-In Dishwashers** — golden Frigidaire `PDSH4816AF` Delivery Format row from vendor Expected Output  
2. **Faucets + Fittings** — deep LOV Accept path (`UNI-FCT-*` / `UNI-FIT-*`)  
3. **Sample Input top categories** — lighting, decking, abrasives, tools (classify + brand + UOM + descriptions + constrained attrs)

## Data provenance

Vendor files (copied read-only):

- `packages/db/prisma/data/unilog/vendor/sample_input.csv` — 1,000 Unihack Sample Input rows  
- `packages/db/prisma/data/unilog/vendor/expected_output_delivery_format.csv` — frozen **252** headers + 1 dishwasher golden row  

Synthetic masters (rebuilt with `pnpm build:unilog-pack`):

- `delivery_format_headers.json`, `golden_dishwasher.json`, `golden_gt.json`  
- `sample_items.json` (1,000), `scored_subset.json`, `taxonomy.json`  
- `brand_master.json` (mined + known aliases), `lov_categories.json`, `uom_rules.json`  
- Existing `raw_items.json` / `ground_truth.json` / faucet & fitting LOVs for the Accept demo  

**Honest gaps:** LOVs and brand masters are synthesized from the two vendor files + mining — not the official UniCat 161k / 27k lists. No live manufacturer scrape.

## Prerequisites

```bash
pnpm build:unilog-pack   # regenerate pack from vendor CSVs
pnpm db:seed             # or pnpm db:seed:unilog
pnpm dev
```

Demo login: `owner@kernle.local` / `demo1234`

## Live UI path

1. Open **Intelligence → Industrial demo** (`/intelligence/unilog`)  
2. Enrich a seeded faucet/fitting SKU (Accept queue)  
3. **Batch sample (50)** against the 1,000-row Sample Input  
4. Inspect **Delivery Format preview**  
5. **Download Delivery Format CSV** (exact Expected Output headers)  
6. **Score vs ground truth** — PIM field accuracy, LOV hit rate, char limits, golden DF accuracy, sample subset  

## API

| Method | Path | Role | Behavior |
|--------|------|------|----------|
| `POST` | `/api/ai/unilog/enrich` | Contributor | PIM suggestions + `deliveryPreviews` |
| `POST` | `/api/ai/unilog/batch` | Contributor | `{ source: "sample1000"\|"seed", limit?, skus? }` → Delivery Format rows |
| `GET` | `/api/ai/unilog/export` | Viewer | CSV of last batch (`csv`, `filename`, 252 headers) |
| `GET` | `/api/ai/unilog/eval` | Viewer | PIM GT + golden Delivery Format + sample subset metrics |
| `POST` | `/api/ai/suggestions/:id/accept` | existing | Writes one attribute to live product |

## Scripts

```bash
pnpm build:unilog-pack
pnpm --filter @kernle/api test
API_URL=http://127.0.0.1:3300/api pnpm demo:unilog
API_URL=http://127.0.0.1:3300/api pnpm e2e:unilog
```

## Pipeline modules

Under `apps/api/src/intelligence/unilog/`:

| Step | Module |
|------|--------|
| Placeholders | `placeholders.ts` |
| Brand resolve | `brand-resolve.ts` |
| Multi-category classify | `classify.ts` |
| UOM / fractions | `uom.ts` |
| Extract + Delivery Format | `extract.ts`, `delivery-format.ts` |
| Descriptions | `descriptions.ts` |
| Dedupe | `dedupe.ts` |
| CSV export | `export-csv.ts` |
| Batch memory store | `batch-store.ts` |
| Eval | `eval.ts` |

## Out of scope

- Official UniCat 27k brand / 161k LOV import (swap masters when available)  
- Live manufacturer site scraping  
- Changing Expected Output header names or order  
- Auto-committing suggestions to live `Product.values`  

See also [PRODUCT_INTELLIGENCE.md](./PRODUCT_INTELLIGENCE.md).
