# Dockerfile simple para ThreeLinker
FROM node:22-alpine

ARG SERVER_PORT=http://localhost:3001
ARG DOMAIN=http://localhost
ARG FRONTEND_PORT=5173

ENV SERVER_PORT=${SERVER_PORT}
ENV DOMAIN=${DOMAIN}
ENV FRONTEND_PORT=${FRONTEND_PORT}

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (incluye devDependencies para concurrently)
RUN npm install

# Copiar todo el código fuente
COPY . .

# Exponer puertos
EXPOSE 3001 5173

# Ejecutar el comando dev:full
CMD ["npm", "run", "start"]