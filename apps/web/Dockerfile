# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=... .
ARG NODE_IMAGE=node:24.18-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# 1. Keep only @abyss/web and its workspace dependencies (form-commons).
FROM base AS prune
ARG TURBO_VERSION=2.11.9
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune @abyss/web --docker

# 2. Install from the pruned lockfile (cached layer), then build.
#    Turbo builds @abyss/form-commons first (^build).
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
# turbo prune keeps workspace packages only; root config files come separately.
COPY --from=prune /repo/tsconfig.base.json ./
# Baked into the bundle at build time; see apps/web/.env.example.
ARG VITE_API_BASE_URL
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL build arg is required" >&2; exit 1)
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm turbo run build --filter=@abyss/web

# 3. Runtime: static files on unprivileged nginx (runs as uid 101, port 8080).
FROM ${NGINX_IMAGE} AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
