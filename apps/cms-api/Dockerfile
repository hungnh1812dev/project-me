# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/cms-api/Dockerfile .
ARG NODE_IMAGE=node:24.18-alpine
# Major of the PostgreSQL client tools in the runtime stage; keep equal to the server image (checked by pins-check.sh).
ARG POSTGRES_MAJOR=17

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
#    prisma/ + prisma.config.ts (read by `db:migrate`) and content/ (migrations +
#    snapshot, read by `content:migrate`; schemas, read by `graphql:print-schema`
#    and `content:generate` checks), files owned by root, run as the numeric
#    `node` user (1000:1000; Kubernetes runAsNonRoot can only verify a UID).
#    The same image runs the nightly backup job (ADR 0025): it adds the
#    PostgreSQL client tools, age and rclone plus backup/nightly-backup.sh,
#    root-owned and read-only for the runtime user. The default CMD is unchanged.
FROM ${NODE_IMAGE} AS runtime
ARG POSTGRES_MAJOR
ENV NODE_ENV=production
RUN apk add --no-cache postgresql${POSTGRES_MAJOR}-client age rclone
WORKDIR /app
COPY --from=build /prod/cms-api/package.json ./package.json
COPY --from=build /prod/cms-api/node_modules ./node_modules
COPY --from=build /prod/cms-api/dist ./dist
COPY --from=build /repo/apps/cms-api/prisma ./prisma
COPY --from=build /repo/apps/cms-api/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/cms-api/content ./content
COPY --from=build --chown=0:0 --chmod=0555 /repo/apps/cms-api/backup/nightly-backup.sh ./backup/nightly-backup.sh
USER 1000:1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
