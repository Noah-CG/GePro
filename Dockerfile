# syntax=docker/dockerfile:1

# Image de production : docker build -t gepro .
# Outils (migrations, seed, comptes) : docker build --target tools -t gepro-tools .

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dépendances (dev comprises : nécessaires au build et aux scripts) -----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Sources -----------------------------------------------------------------
FROM base AS source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- Outils : lance les migrations par défaut ----------------------------------
# docker run --rm -e DATABASE_URL=... gepro-tools
# docker run --rm -e DATABASE_URL=... gepro-tools npm run user:create -- --name ... --email ... --password ... --admin
FROM source AS tools
CMD ["npm", "run", "db:migrate"]

# --- Build -------------------------------------------------------------------
FROM source AS builder
RUN npm run build

# --- Exécution (cible par défaut) ----------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
