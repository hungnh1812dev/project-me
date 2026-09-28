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
RUN pnpm turbo run build --filter=frontend

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public
USER node
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
