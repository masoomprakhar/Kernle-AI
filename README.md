# Kernle AI

Multi-tenant Product Information Management (PIM) platform — catalog, DAM, import/export, syndication, and agentic AI enrichment.

## Stack

| Package | Role |
|---------|------|
| `apps/web` | Next.js 14 App Router + Tailwind + shadcn-style UI |
| `apps/api` | NestJS REST API |
| `packages/db` | Prisma + PostgreSQL |
| `packages/types` | Shared TypeScript types |

Infra (Docker Compose): PostgreSQL (`5435`), Redis (`6381`), MinIO (`9010`).

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis minio
pnpm install
pnpm db:generate
pnpm --filter @kernle/db exec prisma db push
pnpm db:seed
pnpm dev:api   # http://localhost:3000/api/docs
pnpm dev:web   # http://localhost:3001
```

Demo login after seed: `owner@kernle.local` / `demo1234`

Full stack (production images): `docker compose up --build`

## Docker / ECS Fargate

Images are built from the monorepo root:

```bash
# API (port 3000, health: GET /api/health)
docker build -f apps/api/Dockerfile -t kernle-api:latest .

# Web (port 3000, pass public API URL at build time)
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api \
  -t kernle-web:latest .
```

ECS task definition templates live in `deploy/aws/`. On push to `main`, `.github/workflows/ecr-build.yml` can build and push to ECR when `AWS_ROLE_TO_ASSUME` and `AWS_ACCOUNT_ID` are configured.

API container runs Prisma migrations on start (`RUN_SEED=true` only for demos).

## Phases

1. Foundation, multi-tenancy, auth, app shell
2. Core PIM (attributes, families, categories, products, variants, completeness)
3. DAM (assets, thumbnails, product links)
4. Import/export + supplier portal
5. Syndication (webhook + Shopify + stubs)
6. Agentic AI (Ask Kernle, enrichment, quality, GEO score)
7. Marketing, Stripe billing, super-admin, CI/hardening

## Security notes

- Tenant tables are scoped by `organizationId`; use `PrismaService.forTenant(orgId)`
- RBAC enforced via Nest guards (`Owner` > `Admin` > `CatalogManager` > `Contributor` > `Viewer`)
- AI never auto-publishes; suggestions require Accept
- Secrets live in env vars only (see `.env.example`)
