# The API runs TypeScript directly on Node 24 (type stripping), so there is no build step.
# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:24.11.0-slim AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/server-core/package.json packages/server-core/
COPY packages/design-system/package.json packages/design-system/
COPY packages/i18n/package.json packages/i18n/
COPY packages/renderer/package.json packages/renderer/
RUN pnpm install --frozen-lockfile --prod --filter @menu-studio/api...

FROM node:24.11.0-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --create-home --uid 10001 api

# Source first, then the installed modules: pnpm's symlinks must land on top.
COPY package.json pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages

USER api
EXPOSE 5323
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:5323/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/index.ts"]
