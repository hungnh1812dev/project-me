# syntax=docker/dockerfile:1
# Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=... .
ARG NODE_IMAGE=node:24.18-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NEXT_TELEMETRY_DISABLED=1
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
# Baked into the browser bundle at build time; see apps/web/.env.example.
ARG NEXT_PUBLIC_API_BASE_URL
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" || (echo "NEXT_PUBLIC_API_BASE_URL build arg is required" >&2; exit 1)
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# Optional: target of the "Open CMS" link. Empty hides the link.
ARG NEXT_PUBLIC_ADMIN_URL=
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
RUN pnpm turbo run build --filter=@abyss/web

# 3. Runtime: the Next.js standalone server on Node, as the non-root `node` user.
#    Server env (API_INTERNAL_URL, WEB_REVALIDATE_SECONDS) is set at run time.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV WEB_PORT=8080
WORKDIR /app
# The standalone output keeps the monorepo layout: the server is apps/web/server.js.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${WEB_PORT}/" || exit 1
# server.js reads PORT; WEB_PORT is the name this project documents.
CMD ["sh", "-c", "PORT=$WEB_PORT exec node apps/web/server.js"]
