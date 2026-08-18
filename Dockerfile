# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------- dependencies
FROM node:26-alpine AS deps
WORKDIR /app
# postinstall runs `prisma generate`, which needs the schema and config.
COPY package.json package-lock.json prisma.config.ts ./
COPY src/shared/infrastructure/prisma/schema.prisma src/shared/infrastructure/prisma/schema.prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------- migrations (one-off job)
FROM deps AS migrate
COPY src/shared/infrastructure/prisma ./src/shared/infrastructure/prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------- runtime
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Never run as root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
