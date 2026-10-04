# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/cms-api/Dockerfile -t cms-api .

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.5.2 turbo@2.11.5
ENV CI=true
WORKDIR /app

# Prune the monorepo down to cms-api and its workspace dependencies
FROM base AS prepare
COPY . .
RUN turbo prune cms-api --docker

# Manifests + pruned lockfile only, so the stages below re-run only when dependencies change
FROM base AS manifests
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./

# Production-only dependencies
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --legacy --filter=cms-api --prod --store-dir /pnpm/store /prod/cms-api

# All dependencies + source, then build
FROM manifests AS builder
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=prepare /app/out/full/ .
RUN --mount=type=cache,id=turbo-cms-api,target=/app/.turbo/cache \
    pnpm turbo run build --filter=cms-api

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /prod/cms-api/package.json ./package.json
COPY --from=prod-deps --chown=node:node /prod/cms-api/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/cms-api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
