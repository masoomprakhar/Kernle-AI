# Kernle API — NestJS (ECS Fargate ready)
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl curl \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm --filter @kernle/types build \
  && pnpm --filter @kernle/db generate \
  && pnpm --filter @kernle/db build \
  && pnpm --filter @kernle/api build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN addgroup -S kernle && adduser -S kernle -G kernle

COPY --from=build --chown=kernle:kernle /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=build --chown=kernle:kernle /app/node_modules ./node_modules
COPY --from=build --chown=kernle:kernle /app/apps/api ./apps/api
COPY --from=build --chown=kernle:kernle /app/packages ./packages
COPY --chown=kernle:kernle apps/api/docker-entrypoint.sh /app/apps/api/docker-entrypoint.sh

RUN chmod +x /app/apps/api/docker-entrypoint.sh

USER kernle
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
