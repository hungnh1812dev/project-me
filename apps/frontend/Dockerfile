# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/frontend/Dockerfile -t frontend .
# Uses Next's standalone output (next.config.ts: output: "standalone").

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.5.2 turbo@2.11.5
ENV CI=true
WORKDIR /app

# Prune the monorepo down to frontend and its workspace dependencies
FROM base AS prepare
COPY . .
RUN turbo prune frontend --docker

# Install and build
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=prepare /app/out/full/ .
# Persist turbo's cache and Next's Turbopack build cache (.next/cache) across builds
RUN --mount=type=cache,id=turbo-frontend,target=/app/.turbo/cache \
    --mount=type=cache,id=next-frontend,target=/app/apps/frontend/.next/cache \
    pnpm turbo run build --filter=frontend

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# Non-root runtime user abyss (UID/GID 1001), same as cms-admin; the base image's node (1000) is unused
RUN addgroup -S -g 1001 abyss \
    && adduser -S -D -H -u 1001 -G abyss -s /sbin/nologin abyss
# Traced dependencies first (change rarely), then app code (changes often)
COPY --from=builder --chown=1001:1001 /app/apps/frontend/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=1001:1001 /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=1001:1001 /app/apps/frontend/.next/standalone/apps ./apps
EXPOSE 3000
# Numeric, so Kubernetes runAsNonRoot can verify it
USER 1001
CMD ["node", "apps/frontend/server.js"]
