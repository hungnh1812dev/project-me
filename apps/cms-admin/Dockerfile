# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/cms-admin/Dockerfile -t cms-admin .

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.5.2 turbo@2.11.5
ENV CI=true
WORKDIR /app

# Prune the monorepo down to cms-admin and its workspace dependencies
FROM base AS prepare
COPY . .
RUN turbo prune cms-admin --docker

# Install and build static files
FROM base AS builder
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=prepare /app/out/full/ .
RUN --mount=type=cache,id=turbo-cms-admin,target=/app/.turbo/cache \
    pnpm turbo run build --filter=cms-admin

# Serve static files with nginx
FROM nginx:alpine AS runner
# nginx.conf is an envsubst template: the image renders it to /etc/nginx/conf.d/default.conf
# at start-up. Empty defaults give a valid self-only CSP instead of a literal ${...}.
ENV CSP_API_ORIGIN="" CSP_IMG_ORIGINS=""
COPY apps/cms-admin/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/cms-admin/dist /usr/share/nginx/html
EXPOSE 80
