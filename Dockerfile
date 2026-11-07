# Rein production container
# Node 22 multi-stage build: compiles TypeScript and Vite SPA, runs minimal production server

FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY server ./server
COPY web ./web
RUN npm run typecheck
RUN npm run web:build

# Production runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4317
ENV REIN_TRUST_PROXY=1

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built web assets and server code
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/server ./server
COPY mandate.json ./

EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4317/healthz || exit 1

CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.ts"]
