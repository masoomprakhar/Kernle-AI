# Industrial Enrichment Demo (Unilog-style)

Judge-facing walkthrough for Kernle’s Accept-gated industrial enrichment slice. Customer UI copy says **Industrial enrichment** — not Unilog/Akeneo.

## What it demonstrates

```
Messy SKU / Part_Desc → normalize & classify → LOV + UOM self-check → AiSuggestion Accept queue → live Product.values → score vs ground truth
```

- **Categories:** Kitchen/Bath faucets + pipe/tube fittings  
- **~50 synthetic SKUs** (`UNI-FCT-*`, `UNI-FIT-*`) with abbreviated descriptions and brand placeholders  
- **20 labelled ground-truth rows** for field accuracy / LOV hit rate / description char limits  
- **Never auto-commits** AI output to live catalog values  

## Prerequisites

```bash
pnpm db:seed          # apparel + industrial (SEED_UNILOG=false to skip industrial)
# or
pnpm db:seed:unilog   # industrial pack only (requires kernle-demo org)

pnpm dev              # API + web (ports per your local .env)
```

Demo login: `owner@kernle.local` / `demo1234`

## Live UI path

1. Open **Intelligence → Industrial demo** (`/intelligence/unilog`)  
2. Pick a messy SKU — note empty brand / raw `part_desc`  
3. **Enrich this SKU** (or **Enrich labelled set**)  
4. Triage the Accept queue — “needs attention” when LOV/self-check fails  
5. **Accept** clear proposals → live product values update  
6. **Score vs ground truth** — field accuracy, LOV hit rate, char-limit compliance  

## API

| Method | Path | Role | Behavior |
|--------|------|------|----------|
| `POST` | `/api/ai/unilog/enrich` | Contributor | `{ productIds? \| skus? }` → suggestions only |
| `GET` | `/api/ai/unilog/eval` | Viewer | `?usePending=false` to score accepted-only |
| `POST` | `/api/ai/suggestions/:id/accept` | existing | Writes one attribute to live product |

Faucet/fitting families also route through the same pipeline when using `POST /api/ai/extract`.

## Scripts

```bash
# Unit tests (brand, UOM, descriptions, LOV self-check)
pnpm --filter @kernle/api test

# Seed → enrich → accept sample → eval summary
API_URL=http://127.0.0.1:3300/api pnpm demo:unilog

# Stricter e2e (5 faucets, accuracy threshold)
API_URL=http://127.0.0.1:3300/api node scripts/e2e-unilog.mjs
```

## Pipeline modules

Under `apps/api/src/intelligence/unilog/`:

| Step | Module |
|------|--------|
| Strip placeholders | `placeholders.ts` |
| Brand alias → master | `brand-resolve.ts` |
| UOM / fractions | `uom.ts` |
| Classify classpath | `classify.ts` |
| Attribute extract + describe | `extract.ts`, `descriptions.ts` |
| Score vs GT | `eval.ts` |

LOV validation is in `self-check.ts` (`lov_not_allowed` → `needsAttention`).

## Data pack

`packages/db/prisma/data/unilog/`:

- `raw_items.json`, `ground_truth.json`  
- `brand_master.json`, `uom_rules.json`  
- `lov_faucets.json`, `lov_fittings.json`  

## Out of scope (this pass)

- Full 27k brand / 161k LOV import  
- Live manufacturer scraping  
- Replacing the apparel retail seed  

See also [PRODUCT_INTELLIGENCE.md](./PRODUCT_INTELLIGENCE.md) for the broader Accept-gated spine (Phases 1–5).
