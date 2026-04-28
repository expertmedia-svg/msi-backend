# ============================================================
# Dockerfile – Backend MSI BF (Node.js)
# ============================================================
FROM node:20-alpine AS base

# Dépendances système pour bcrypt et sharp
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# ── Stage production ──────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

RUN npm ci --only=production && npm cache clean --force

COPY src/ ./src/

# Créer les répertoires nécessaires
RUN mkdir -p /app/uploads /app/logs && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
