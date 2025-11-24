# ============================
#      🔨 BUILDER STAGE
# ============================
FROM node:22-alpine AS builder

WORKDIR /app

# ---------- Copiar package.json del root, backend y frontend ----------
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/

# ---------- Instalar dependencias de root (incluye concurrently, si aplica) ----------
RUN npm install

# ---------- Instalar deps y build del backend ----------
RUN npm --prefix backend install
COPY backend ./backend
RUN npm --prefix backend run build   # genera backend/dist

# ---------- Instalar deps y build del frontend ----------
RUN npm --prefix frontend install
COPY frontend ./frontend
RUN npm --prefix frontend run build  # genera frontend/dist



# ============================
#      🚀 RUNTIME STAGE
# ============================
FROM node:22-alpine AS runner

WORKDIR /app

# Copiar backend compilado y solo sus deps de producción
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/

RUN npm --prefix backend install --omit=dev

# Copiar frontend compilado listo para servir
COPY --from=builder /app/frontend/dist ./frontend/dist

# Instalar 'serve' para servir el frontend
RUN npm install -g serve

# Multi-server setup: support different startup modes
# MODE can be: "single" (frontend + backend), "server" (backend only), "frontend" (frontend only)
ARG MODE=single
ENV MODE=${MODE}

EXPOSE 3001 3002 80 5173

# Startup based on mode
CMD if [ "$MODE" = "server" ]; then \
        echo "Starting server mode (backend only)"; \
        node backend/dist/server.js; \
    elif [ "$MODE" = "frontend" ]; then \
        echo "Starting frontend mode"; \
        serve -s frontend/dist -l ${FRONTEND_PORT:-5173}; \
    else \
        echo "Starting single mode (frontend + backend)"; \
        node backend/dist/server.js & serve -s frontend/dist -l ${FRONTEND_PORT:-5173}; \
    fi
