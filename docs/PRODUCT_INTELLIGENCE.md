# Product Intelligence — end-to-end guide

Kernle turns scattered product information (URLs, PDFs, pasted notes) into
**Accept-gated**, explainable catalog data. Phases 1–4 built the capabilities;
Phase 5 wires them into one workflow and dashboard. Nothing from AI writes
directly to live `Product.values` — every proposal still ends at human Accept.

## Pipeline

```
Sources → Extract → Conflicts / consistency → Self-check + explanation → Accept → Completeness / GEO
```

| Step | Where | API / module |
|------|--------|----------------|
| Ingest sources | Workflow `/products/new/from-source` | `POST /api/ai/sources`, `POST /api/ai/sources/upload` |
| Extract draft | Same workflow | `POST /api/ai/extract` → BullMQ `ai.source_extract` |
| Conflicts | Suggestions with `explanation.conflict` | `intelligence/conflict.ts` |
| Consistency | AI Insights findings | `POST /api/ai/quality/scan`, merge / canonicalize |
| Explain + self-check | “Why this suggestion?” | `explanation.ts`, `self-check.ts` |
| Accept | Workflow review, product page, `/ai` | `POST /api/ai/suggestions/:id/accept` |
| Scale | Queues, reprocess, load script | Phase 4 — priorities, per-org concurrency |
| Operate | `/intelligence`, Dashboard card | `GET /api/ai/insights/overview` |
| Bulk on existing SKUs | Products selection | `POST /api/ai/intelligence/bulk-run` |

## UI map

- **`/intelligence`** — catalog-wide health: from-source volume, avg source→Accept time, findings, accuracy, queue triage.
- **`/products/new/from-source`** — guided Setup → Sources → Extract → Review → Live.
- **`/products`** — select SKUs → **Intelligence run** (shared source cloned per product, batch-priority jobs).
- **`/ai`** — full enrichment queue, batch fill, accuracy, jobs metrics, quality findings.
- **Dashboard** — Product Intelligence summary card linking to `/intelligence`.
- **Marketing** — `#product-intelligence` under Intelligence on the public homepage.

## Contributor checklist

1. Prefer extending `AiSuggestion.explanation` over new tables.
2. Keep `organizationId` on every query; use the tenant-scoped Prisma client.
3. Interactive extract = high priority + await; bulk = batch priority + queue.
4. Incremental reprocess scopes by `sourceDocumentId` / `explanation.sourceDocumentIds`.
5. Document contract changes in `docs/DESIGN.md` and this file.

## Local verification

```bash
# Unit tests (intelligence helpers)
pnpm --filter @kernle/api test

# Full Accept-gated workflow against a running API (AI_MOCK recommended)
pnpm e2e:intelligence

# Throughput drain (Phase 4)
LOAD_SKU_COUNT=25 pnpm load:intelligence
```

Demo login: `owner@kernle.local` / `demo1234`. API default `http://localhost:3100/api`.
