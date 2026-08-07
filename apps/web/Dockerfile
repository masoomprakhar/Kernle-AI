# Kernle Web — Next.js standalone (ECS Fargate ready)
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/types ./packages/types
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kernle/types build && pnpm --filter @kernle/web build

FROM node:20-alpine AS runner
RUN apk add --no-cache curl \
  && addgroup -S kernle && adduser -S kernle -G kernle
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=kernle:kernle /app/apps/web/.next/standalone ./
COPY --from=build --chown=kernle:kernle /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=kernle:kernle /app/apps/web/public ./apps/web/public

USER kernle
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" || exit 1

CMD ["node", "apps/web/server.js"]
