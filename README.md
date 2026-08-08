# Kernle AI

**Product data infrastructure for teams that ship across channels.**

Kernle AI is a multi-tenant B2B Product Information Management (PIM) platform. It is built for catalogs that have outgrown spreadsheets: attributes and families that match how you sell, media on the same record as the SKU, supplier intake with human approval, channel readiness checks before publish, and AI enrichment that drafts — while people decide.

> One catalog. Every channel. Always accurate.  
> AI drafts. People decide. Nothing publishes without an explicit accept.

---

## Why Kernle exists

Most growing brands do not have a product data system. They have:

- a spreadsheet (or twelve)
- an ERP export that is almost right
- a folder of unlabeled packshots
- supplier emails with “final” specs that are not final

By the time a product reaches a storefront, several people have touched it and none of them agree on the description. That is a systems problem, not a content problem — and it gets worse with every new channel, market, or thousand SKUs.

Kernle sits between your systems of record (ERP, suppliers, spreadsheets) and your systems of engagement (storefronts, marketplaces, print, AI shopping assistants). Product data is created once, enriched once, and distributed everywhere.

---

## What you get

| Area | Capability |
|------|------------|
| **Catalog engine** | Attributes, families, categories, products, variants, completeness by channel/locale |
| **DAM** | Asset library with product links, thumbnails, signed access |
| **Import / export** | Spreadsheet and ERP-style intake; structured export paths |
| **Supplier portal** | Scoped token-based portal so partners submit only their products |
| **Syndication** | Channel readiness, sync status, connectors (Shopify, Amazon stubs, webhook, print, etc.) |
| **AI enrichment** | Ask Kernle, attribute/copy suggestions with confidence scores, quality findings, GEO score |
| **Platform** | Multi-tenant orgs, workspaces, RBAC, JWT auth, marketing site, billing stubs |

---

## Architecture

```text
┌─────────────────┐     HTTPS/HTTP      ┌──────────────────┐
│  apps/web       │ ──────────────────► │  apps/api        │
│  Next.js 14     │   /api/*            │  NestJS REST     │
│  App Router     │                     │  Swagger /docs   │
└─────────────────┘                     └────────┬─────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    ▼                            ▼                            ▼
             PostgreSQL                    Redis / BullMQ                 Object store
             (Prisma)                      (jobs / queues)               (local / MinIO / S3)
```

### Monorepo layout

```text
apps/
  web/                 Next.js UI (marketing + authenticated app)
  api/                 NestJS API
packages/
  db/                  Prisma schema, migrations, seed
  types/               Shared TypeScript types
deploy/aws/            ECS task templates, CloudFront config, deploy notes
docker-compose.yml     Local Postgres, Redis, MinIO (+ optional full stack)
scripts/               Smoke tests and utilities
```

| Package | Role |
|---------|------|
| `@kernle/web` | App Router UI, Tailwind, design-system components |
| `@kernle/api` | REST API, auth, PIM, DAM, AI, syndication, billing stubs |
| `@kernle/db` | Prisma client, migrations, demo seed |
| `@kernle/types` | Cross-app types |

### Runtime stack

- **Node.js** 20+
- **pnpm** workspaces (`9.15.0`)
- **PostgreSQL** 16
- **Redis** 7 (BullMQ)
- **Object storage**: filesystem locally; MinIO in Compose; S3 bucket on AWS
- **Optional**: Anthropic for live AI (`AI_MOCK=true` uses deterministic mock responses)

---

## Multi-tenancy and security

Kernle is multi-tenant by design.

- Every tenant-owned table includes `organizationId`.
- API requests carry JWT auth plus `x-organization-id` (and workspace when needed).
- Prefer scoped Prisma access (`PrismaService.forTenant(orgId)`) — never query tenant data without org context.

### RBAC roles

| Role | Intent |
|------|--------|
| **Owner** | Full organization control |
| **Admin** | Users, settings, catalog operations |
| **CatalogManager** | Own the product catalog |
| **Contributor** | Edit product data and assets |
| **Viewer** | Read-only |

Enforced in Nest guards on protected routes.

### AI safety

- AI suggestions are **never** written to live product fields without an explicit Accept.
- Suggestions carry confidence metadata for human review.
- Prefer `AI_MOCK=true` in local/demo environments unless you intentionally call Anthropic.

---

## Prerequisites

- Node.js **≥ 20**
- pnpm **9.15** (`corepack enable` recommended)
- Docker Desktop (for Postgres / Redis / MinIO, or full Compose)
- Optional: AWS CLI + Docker buildx for ECS/ECR deploys (`linux/amd64`)

---

## Local development

### 1. Clone and install

```bash
git clone https://github.com/masoomprakhar/Kernle-AI.git
cd Kernle-AI
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local   # if present
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d postgres redis minio
```

Default host ports (mapped to avoid common conflicts):

| Service | Host port |
|---------|-----------|
| Postgres | `5435` |
| Redis | `6381` |
| MinIO API | `9010` |
| MinIO console | `9011` |

### 3. Database

```bash
pnpm db:generate
pnpm db:migrate          # or: pnpm db:push for quick local iteration
pnpm db:seed
```

### 4. Run apps

```bash
# Terminal A — API (Swagger)
pnpm dev:api
# → http://localhost:3200/api/docs

# Terminal B — Web
pnpm dev:web
# → http://localhost:3201
```

Or both: `pnpm dev` (parallel filters).

Align `NEXT_PUBLIC_API_URL` in the web env with the API (default `http://localhost:3200/api`).

### Demo accounts (after seed)

| Email | Password | Notes |
|-------|----------|--------|
| `owner@kernle.local` | `demo1234` | Owner + super-admin |
| `admin@kernle.local` | `demo1234` | Admin |
| `viewer@kernle.local` | `demo1234` | Read-only |

Seed also loads a **Kernle Demo** org with sample apparel SKUs, quality findings, AI suggestions, and channel sync statuses so the dashboard is populated.

---

## Useful scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` / `dev:api` / `dev:web` | Local development servers |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `pnpm db:generate` | Prisma client generate |
| `pnpm db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | Demo org + catalog dummy data |
| `pnpm db:push` | Push schema without migration history (dev only) |
| `pnpm smoke` | Smoke script against a running stack |

---

## Environment variables

See `.env.example` for the full list. Important groups:

| Group | Examples | Notes |
|-------|----------|--------|
| Database | `DATABASE_URL` | Postgres connection string |
| Redis | `REDIS_URL` | Required for BullMQ jobs |
| Auth | `JWT_*`, `WEB_ORIGIN`, `APP_URL` | CORS and cookie/app URLs must match the web origin |
| Storage | `STORAGE_PATH` or `S3_*` | Local path vs MinIO/S3 |
| AI | `AI_MOCK`, `ANTHROPIC_API_KEY` | Mock by default |
| Billing | `STRIPE_*` | Optional stubs |
| Super-admin | `SUPER_ADMIN_EMAILS` | Comma-separated |

**Production tip:** store secrets in AWS Secrets Manager (or similar). Do not commit `.env` files.

---

## Docker

Images are built from the **monorepo root**.

```bash
# API — health: GET /api/health
docker build --platform linux/amd64 -f apps/api/Dockerfile -t kernle-api:latest .

# Web — bake public API URL at build time
docker build --platform linux/amd64 -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://your-host/api \
  -t kernle-web:latest .
```

On Apple Silicon, always pass `--platform linux/amd64` for ECS Fargate.

### API container behavior

`apps/api/docker-entrypoint.sh`:

1. Runs Prisma migrations
2. Optionally seeds when `RUN_SEED=true`
3. Starts the Nest process on `PORT` (default `3000`)

### Full local Compose stack

```bash
docker compose up --build
```

Brings up Postgres, Redis, MinIO, API, and Web with production-style images.

---

## AWS deployment (ECS Fargate)

Reference templates and notes live under [`deploy/aws/`](./deploy/aws/).

### Target shape

```text
Internet → ALB
            ├─ /*        → ECS service kernle-web  (Next.js :3000)
            └─ /api/*    → ECS service kernle-api  (NestJS :3000)
                              ├─ RDS PostgreSQL
                              ├─ ElastiCache Redis
                              └─ S3 bucket (assets)
```

### High-level steps

1. Provision **RDS**, **ElastiCache**, **S3**, **ECR**, **ECS cluster**, **ALB**
2. Store secrets (`DATABASE_URL`, `REDIS_URL`, JWT secrets) in Secrets Manager
3. Build/push `linux/amd64` images to ECR
4. Register task definitions (see `deploy/aws/ecs-task-*.json`)
5. Create Fargate services attached to ALB target groups
6. Smoke-test `/api/health` and the marketing/app UI

### HTTPS without a custom domain

Browsers mark the raw ALB HTTP URL as “Not Secure”. To get a trusted padlock **without owning a domain**, put **CloudFront** in front of the ALB (Amazon issues HTTPS on `https://dxxxx.cloudfront.net`). Config sketch: `deploy/aws/cloudfront-config.json`.

> New AWS accounts sometimes need Support verification before CloudFront `CreateDistribution` is allowed.

Task templates, live resource names, and rebuild notes: [`deploy/aws/README.md`](./deploy/aws/README.md) and [`deploy/aws/DEPLOYED.md`](./deploy/aws/DEPLOYED.md).

---

## Product surface (web)

| Area | Routes (examples) |
|------|-------------------|
| Marketing | `/`, `/marketing` |
| Auth | `/login`, `/signup`, `/onboarding`, … |
| App | `/dashboard`, `/products`, `/categories`, `/attributes`, `/families` |
| Assets | `/assets` |
| Suppliers / import | `/suppliers`, `/import-export` |
| Channels | `/channels` |
| AI | `/ai` |
| Settings / admin | `/settings`, `/admin` |
| Supplier portal | `/portal/[token]` |

The dashboard shows catalog completeness, quality findings, AI review queue, channel readiness, and recent activity — populated by seed data in demo environments.

---

## API overview

- Global prefix: `/api`
- Interactive docs: `/api/docs` (Swagger)
- Health: `GET /api/health` (includes DB check)

Major modules include auth, orgs/workspaces, PIM, DAM, import/export, suppliers, syndication, AI, billing, and admin.

Authenticated calls typically send:

```http
Authorization: Bearer <accessToken>
x-organization-id: <organizationId>
```

---

## Build phases (roadmap delivered in-repo)

1. **Foundation** — multi-tenancy, auth, app shell  
2. **Core PIM** — attributes, families, categories, products, variants, completeness  
3. **DAM** — assets, thumbnails, product links  
4. **Import/export + suppliers** — intake and portal  
5. **Syndication** — channel readiness and connectors  
6. **Agentic AI** — Ask Kernle, enrichment, quality, GEO score  
7. **Go-to-market** — marketing site, billing stubs, super-admin, CI/hardening  

---

## Design and product constraints

- Original Kernle branding and copy only — do not copy competitor UI or marketing.
- Prefer the project design system (ink/canvas, signature surfaces where intentional).
- Marketing homepage copy source: [`docs/HOMEPAGE_COPY.md`](./docs/HOMEPAGE_COPY.md)  
- Design notes: [`docs/DESIGN.md`](./docs/DESIGN.md)

---

## Troubleshooting

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| API CORS errors | `WEB_ORIGIN` ≠ browser origin | Align `.env` with the web URL |
| `Organization context required` | Missing `x-organization-id` | Select org after login; web client sets header from stored org id |
| Empty dashboard | Seed not run | `pnpm db:seed` or API `RUN_SEED=true` |
| ECS `linux/amd64` pull errors | Image built only for arm64 | Rebuild with `--platform linux/amd64` |
| ALB “Not Secure” | HTTP only | Use CloudFront HTTPS or attach ACM + custom domain |
| Prisma migrate failures in Docker | DB not reachable / wrong `DATABASE_URL` | Check SG / subnet / secret ARN |

---

## Repository

- GitHub: [masoomprakhar/Kernle-AI](https://github.com/masoomprakhar/Kernle-AI)

---

## License

Private / unpublished unless otherwise stated by the repository owner.
