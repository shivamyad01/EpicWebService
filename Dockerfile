# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:18-alpine AS frontend-build

ARG SHOPIFY_API_KEY
ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY

WORKDIR /app/frontend
COPY web/frontend/package.json web/frontend/package-lock.json* ./
RUN npm ci --prefer-offline
COPY web/frontend/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:18-alpine AS production

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install backend deps first (layer cache)
COPY web/package.json web/package-lock.json* ./
RUN npm ci --prefer-offline --omit=dev && npm cache clean --force

# Copy backend source
COPY web/ ./

# Remove frontend source (we only need the built dist)
RUN rm -rf frontend/src frontend/node_modules frontend/package.json \
    frontend/vite.config.js frontend/index.html frontend/*.jsx \
    frontend/*.js frontend/*.yml 2>/dev/null || true

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create directories for runtime data
RUN mkdir -p /app/uploads /app/data && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

ENV NODE_ENV=production
ENV PORT=8081
EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8081/api/auth || exit 1

CMD ["node", "index.js"]
