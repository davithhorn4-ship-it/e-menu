FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# `npm run build` runs `prisma generate` first (prebuild).
RUN npm run build

# Separate stage so the builder keeps dev deps (the migrate service runs the
# Prisma CLI from the builder target).
FROM builder AS pruned

RUN npm prune --omit=dev

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=pruned --chown=node:node /app/package.json ./package.json
COPY --from=pruned --chown=node:node /app/node_modules ./node_modules
COPY --from=pruned --chown=node:node /app/dist ./dist
COPY --from=pruned --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 4000

CMD ["node", "dist/main"]
