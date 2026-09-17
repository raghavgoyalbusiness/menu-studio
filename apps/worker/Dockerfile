# The worker runs headless Chromium for PDF/PNG export, so it starts from the Playwright image
# (browser plus the system fonts and libraries Chromium needs).
# Build context is the repo root: docker build -f apps/worker/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/menu/package.json apps/menu/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/server-core/package.json packages/server-core/
COPY packages/design-system/package.json packages/design-system/
COPY packages/renderer/package.json packages/renderer/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --filter @menu-studio/worker... --filter @menu-studio/menu...

COPY . .
# Menus may only use curated, self-hosted fonts, so the image carries its own mirror.
RUN pnpm fonts:mirror
# The publish job imports the QR site's SSR bundle and ships its client assets.
RUN pnpm --filter @menu-studio/menu build

FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER pwuser
CMD ["node", "apps/worker/src/index.ts"]
