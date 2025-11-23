# ---------- Builder ----------
FROM node:22-alpine AS builder

# Variables de entorno
ARG SERVER_PORT=3001
ARG DOMAIN=http://localhost
ARG FRONTEND_PORT=5173

ENV SERVER_PORT=${SERVER_PORT}
ENV DOMAIN=${DOMAIN}
ENV FRONTEND_PORT=${FRONTEND_PORT}

WORKDIR /app

# Copiar archivos raíz
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/

# Instalar dependencias en raíz
RUN npm install

# Copiar todo el código fuente
COPY . .

# Backend: instalar + build
RUN cd backend && npm install && npm run build

# Frontend: instalar + build
RUN cd frontend && npm install && npm run build


# ---------- Runtime ----------
FROM node:22-alpine

WORKDIR /app

# Copiar backend ya compilado
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/

# Copiar frontend ya compilado
COPY --from=builder /app/frontend/dist ./frontend/dist

# Instalar dependencias del backend para producción
RUN cd backend && npm install --omit=dev

EXPOSE 3001 80

# Iniciar backend y servir frontend
CMD ["sh", "-c", "node backend/dist/server.js & npx serve frontend/dist -l 80"]
