# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/cms-api/Dockerfile .
ARG NODE_IMAGE=node:24.18-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# 1. Keep only cms-api and its workspace dependencies.
FROM base AS prune
ARG TURBO_VERSION=2.11.9
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune @abyss/cms-api --docker

# 2. Install from the pruned lockfile (cached layer), then build.
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
# turbo prune keeps workspace packages only; root config files come separately.
COPY --from=prune /repo/tsconfig.base.json ./
RUN pnpm turbo run build --filter=@abyss/cms-api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @abyss/cms-api deploy --prod --legacy /prod/cms-api

# 3. Runtime: production deps, dist (with the generated Prisma client),
#    prisma/ + prisma.config.ts (read by `db:migrate`) and content/ (schemas +
#    migrations, read by `content:migrate`), files owned by root, run as the numeric `node` user (1000:1000; Kubernetes
#    runAsNonRoot can only verify a UID).
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/cms-api/package.json ./package.json
COPY --from=build /prod/cms-api/node_modules ./node_modules
COPY --from=build /prod/cms-api/dist ./dist
COPY --from=build /repo/apps/cms-api/prisma ./prisma
COPY --from=build /repo/apps/cms-api/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/cms-api/content ./content
USER 1000:1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
