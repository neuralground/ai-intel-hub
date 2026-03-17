# ── Build frontend ───────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source
COPY backend/src/ ./backend/src/

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for persistence
RUN mkdir -p /app/backend/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/backend/data

EXPOSE 3001

CMD ["node", "backend/src/server.js"]
