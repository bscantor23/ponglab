# 🎮 PongLab - Laboratorio de Sistemas Distribuidos

![PongLab Logo](frontend/public/ping_pong.gif)

## 📖 Descripción del Proyecto

**PongLab** es un laboratorio de sistemas distribuidos que implementa un juego multijugador de Pong con alta disponibilidad y failover automático. El proyecto demuestra conceptos fundamentales de sistemas distribuidos incluyendo replicación de servidores, sincronización de estados, balanceo de carga y recuperación automática ante fallos.

## 🏗️ Arquitectura del Sistema

### Modelo Cliente-Servidor Distribuido

![PongLab Architecture](pong_lab_architecture.png)

### 🖥️ Servidores Distribuidos
- **Servidor Principal (Puerto 3001)**: Maneja la mayoría de las conexiones y operaciones
- **Servidor de Respaldo (Puerto 3002)**: Toma control automáticamente si el principal falla
- **Failover Automático**: Sistema de elección de servidor primario usando Redis
- **Sincronización de Estados**: Estados de juego sincronizados entre servidores via Redis

## 🛠️ Tecnologías Utilizadas

### Frontend
- **React 18** - Biblioteca de interfaz de usuario
- **TypeScript** - Tipado estático para mejor desarrollo
- **Vite** - Herramienta de construcción rápida
- **Socket.IO Client** - Comunicación en tiempo real con servidores
- **TailwindCSS** - Framework de CSS para diseño responsive

### Backend
- **Node.js** - Runtime de JavaScript
- **TypeScript** - Tipado estático
- **Express.js** - Framework web minimalista
- **Socket.IO** - Comunicación bidireccional en tiempo real
- **Redis** - Base de datos en memoria para cache y sincronización
- **ts-node** - Ejecutor de TypeScript en tiempo de desarrollo

### DevOps y Contenedores
- **Docker** - Containerización de aplicaciones
- **Docker Compose** - Orquestación de servicios múltiples
- **Multi-stage builds** - Optimización de imágenes Docker

### Infraestructura de Sistemas Distribuidos
- **Sincronización de Estados** - Redis Pub/Sub para comunicación entre servidores
- **Failover Automático** - Sistema de elección de líder
- **Balanceo de Carga** - Distribución automática de conexiones
- **Tolerancia a Fallos** - Recuperación automática de desconexiones

## 🎯 Características Principales

### 🕹️ Juego Multiplayer
- **Salas de Juego**: Creación y unión a salas con contraseña opcional
- **Selección de Jugadores**: El anfitrión selecciona 2 jugadores para la partida
- **Física del Juego**: Cálculos de física del lado servidor para prevenir trampas
- **Tiempo Real**: Actualizaciones de estado a 120 FPS

### 👥 Gestión de Jugadores
- **Nombres Únicos**: Validación estricta para evitar nombres duplicados
- **Límites de Longitud**: Máximo 20 caracteres para nombres de sala y jugador
- **Estados de Conexión**: Detección automática de desconexiones y reconexiones
- **Host Exclusivo**: Solo el creador de la sala puede eliminar la sala

### 🔄 Sistema de Failover
- **Detección Automática**: Monitoreo continuo del estado de los servidores
- **Elección de Líder**: Algoritmo distribuido para seleccionar servidor principal
- **Sincronización de Estados**: Restauración automática de salas y jugadores
- **Recuperación Transparente**: Los jugadores no notan el cambio de servidor

### 📡 Comunicación en Tiempo Real
- **Socket.IO**: Comunicación bidireccional de baja latencia
- **Eventos Síncronos**: Sincronización de acciones entre todos los clientes
- **Heartbeat**: Verificación continua de conexiones activas
- **Reconexión Automática**: Reestablecimiento automático de sesiones

## 🚀 Instalación y Ejecución

### Prerequisitos
- Node.js 18+ 
- Docker y Docker Compose
- Git

### Instalación Rápida con Docker
```bash
# Clonar el repositorio
git clone <repository-url>
cd pong-lab

# Construir y ejecutar todos los servicios
docker-compose up --build

# Acceder a la aplicación
# Frontend: http://localhost:5173
# Servidor Principal: http://localhost:3001
# Servidor Respaldo: http://localhost:3002
```

### Instalación Manual

#### 1. Backend
```bash
cd backend
npm install
npm run start:dev  # Servidor principal (puerto 3001)

# En otra terminal
npm run start:backup  # Servidor respaldo (puerto 3002)
```

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev  # Puerto 5173
```

## 📁 Estructura del Proyecto

```
pong-lab/
├── 📁 backend/                 # Servidor backend
│   ├── 📁 controllers/         # Controladores HTTP y Socket.IO
│   │   └── RoomController.ts   # Lógica de salas y jugadores
│   ├── 📁 models/             # Modelos de datos
│   │   ├── Room.ts            # Modelo de sala
│   │   └── Player.ts          # Modelo de jugador
│   ├── 📁 services/           # Lógica de negocio
│   │   └── RoomService.ts     # Servicios de salas
│   ├── redis.ts               # Cliente Redis y funciones
│   └── server.ts              # Servidor principal
├── 📁 frontend/               # Aplicación React
│   ├── 📁 src/
│   │   ├── 📁 components/     # Componentes React
│   │   │   ├── RoomJoin.tsx   # Unión a salas
│   │   │   ├── RoomLobby.tsx  # Lobby de sala
│   │   │   └── Game.tsx       # Interfaz de juego
│   │   ├── socket.ts          # Configuración Socket.IO
│   │   └── App.tsx            # Componente principal
│   └── index.html             # Página principal
├── 📄 docker-compose.yml      # Orquestación de servicios
├── 📄 Dockerfile              # Configuración Docker
└── 📄 README.md              # Este archivo
```

## 🔧 Configuración

### Variables de Entorno

#### Backend (.env)
```env
# Puerto del servidor principal
PORT=3001
BACKUP_PORT=3002

# Configuración Redis
REDIS_URL=redis://localhost:6379

# Identificación del servidor
SERVER_ID=server_a
BACKUP_SERVER_ID=server_b

# Configuración CORS
FRONTEND_URL=http://localhost:5173
```

#### Frontend (.env)
```env
# URLs de los servidores
VITE_DOMAIN=localhost
VITE_SERVER_PORT=3001
VITE_BACKUP_SERVER_PORT=3002
```

## 🔄 Sistema de Failover

### Proceso de Failover

1. **Detección de Fallo**
   - Monitoreo continuo entre servidores
   - Timeouts de respuesta
   - Heartbeat via Redis

2. **Elección de Líder**
   - Publicación de estado "primary_election" en Redis
   - Comparación de timestamps
   - Elección automática del servidor más reciente

3. **Sincronización de Estado**
   - Restauración de salas desde Redis
   - Reconexión de jugadores
   - Actualización de metadata

4. **Recuperación de Sesión**
   - Jugadores reconectan automáticamente
   - Estado de juego restaurado
   - Continuidad transparente

### Ports y Endpoints

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Frontend | 5173 | Interfaz de usuario React |
| Servidor A | 3001 | Servidor principal |
| Servidor B | 3002 | Servidor de respaldo |
| Redis | 6379 | Cache y sincronización |

## 🎮 Cómo Jugar

1. **Crear/Unirse a Sala**
   - Ingresa un nombre de sala (máx. 20 caracteres)
   - Opcional: Agregar contraseña
   - Ingresa tu nombre de jugador (máx. 20 caracteres)

2. **Esperar Jugadores**
   - Otros jugadores pueden unirse a la sala
   - Solo el host puede seleccionar jugadores para el juego

3. **Seleccionar Jugadores**
   - El host selecciona exactamente 2 jugadores
   - Los jugadores seleccionados ven la interfaz de juego

4. **Jugar**
   - Controles: Teclas ↑ ↓ para mover la paleta
   - Objetivo: Anotar 5 puntos para ganar
   - Física: Implementada del lado servidor

## 🧪 Conceptos de Sistemas Distribuidos Demostrados

### ✅ Replicación
- Múltiples servidores con datos consistentes
- Sincronización via Redis Pub/Sub

### ✅ Tolerancia a Fallos
- Failover automático
- Recuperación de sesiones
- Detección de timeouts

### ✅ Consistencia
- Estados de juego sincronizados
- Validación del lado servidor
- Prevención de conflictos

### ✅ Disponibilidad
- Servicio continuo durante fallos
- Balanceo de carga
- Reconexión automática

### ✅ Partition Tolerance
- Funcionamiento independiente de Redis
- Recuperación post-desconexión
- Reconciliación de estados

## 🐛 Solución de Problemas

### Problemas Comunes

#### Los servidores no se conectan
```bash
# Verificar que Redis esté ejecutándose
redis-cli ping

# Verificar puertos
netstat -tulpn | grep :3001
netstat -tulpn | grep :3002
```

#### Los jugadores no se reconectan
- Verificar configuración de WebSocket
- Revisar CORS settings
- Comprobar variables de entorno

#### Problemas de sincronización
- Verificar conexión Redis
- Revisar logs de servidor
- Comprobar configuración de Pub/Sub

## 📚 API Reference

### Socket.IO Events

#### Cliente → Servidor
- `join-room`: Unirse a una sala
- `start-game`: Iniciar juego (solo host)
- `game-update`: Actualizar estado de juego
- `update-selected-players`: Seleccionar jugadores

#### Servidor → Cliente
- `room-joined`: Confirmación de unión a sala
- `room-update`: Actualización de estado de sala
- `game-started`: Inicio de juego
- `game-update`: Actualización de estado de juego
- `room-deleted`: Sala eliminada

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

---

**PongLab** - *Donde los clásicos juegos encuentran la moderna arquitectura distribuida* 🚀