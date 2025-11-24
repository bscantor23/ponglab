import express from "express";
import http from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { RoomController } from "./controllers/RoomController";
import {
  initializeRedis,
  publishGameState,
  closeRedis,
  publishPrimaryServerElection,
  checkRedisHealth,
} from "./redis";

dotenv.config();

// ------------------------------
// 🌐 CORS BASADO 100% EN DOMAIN
// ------------------------------
const DOMAIN = process.env.DOMAIN || "http://localhost";

// Parse DOMAIN => protocolo + hostname
const url = new URL(DOMAIN);
const PROTOCOL = url.protocol; // http: o https:
const HOSTNAME = url.hostname; // localhost o dominio real

// Puertos del backend (node A y node B)
const SERVER_PORT = process.env.SERVER_PORT || "3001";
const BACKUP_PORT = process.env.BACKUP_SERVER_PORT || "3002";

// Rutas de servidores válidos (para FE)
const ALLOWED_ORIGINS = [
  `${PROTOCOL}//${HOSTNAME}:${process.env.FRONTEND_PORT || 5173}`,
  `${PROTOCOL}//${HOSTNAME}:80`,
  `${PROTOCOL}//${HOSTNAME}:${SERVER_PORT}`,
  `${PROTOCOL}//${HOSTNAME}:${BACKUP_PORT}`,
  DOMAIN, // dominio raíz también permitido
];

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log("DEBUG CORS CONFIG:");
console.log("DOMAIN:", DOMAIN);
console.log("PROTOCOL:", PROTOCOL);
console.log("HOSTNAME:", HOSTNAME);

console.log("SERVER_PORT:", SERVER_PORT);
console.log("BACKUP_PORT:", BACKUP_PORT);
console.log("FRONTEND_PORT:", process.env.FRONTEND_PORT);

console.log("ALLOWED_ORIGINS:", ALLOWED_ORIGINS);

const roomController = new RoomController(io);

// Subscribe to primary server election messages
const subscribeToPrimaryServerElection = async () => {
  try {
    const { sub } = await import("./redis");

    await sub.subscribe("primary-server-election", (message: string) => {});
  } catch (error) {
    console.error("Failed to subscribe to primary server election:", error);
  }
};

// Distributed game loop: publish game state to Redis at 120 FPS for smoother gameplay
setInterval(async () => {
  const rooms = roomController.getAllRooms();
  for (const room of rooms) {
    if (room.isGameActive && room.gameState) {
      // Ensure timestamp is updated for client interpolation
      room.gameState.timestamp = Date.now();
      await publishGameState(room.name, room.gameState);
      io.to(room.name).emit("game-update", room.gameState);
    }
  }
}, 1000 / 120); // 120 FPS for smoother synchronization

// Primary server election - Server A stays active, Server B stays backup
const handlePrimaryServerElection = async () => {
  const serverId = process.env.SERVER_ID || "default-server";
  const isServerA = serverId === "server_a";

  if (isServerA) {
    // Check Redis health first
    const redisHealthy = await checkRedisHealth();

    if (!redisHealthy) {
      console.error("❌ Redis is not healthy! Cannot proceed.");
      return;
    }

    // Publish primary server election (informational only)
    await publishPrimaryServerElection(serverId);
  }
};

// Subscribe to ALL room updates on server start (not just active games)
const subscribeToAllRooms = async () => {
  const rooms = roomController.getAllRooms();
  for (const room of rooms) {
    await roomController.subscribeToRoomUpdates(room.name);
  }
};

// Socket.IO connection handling
io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on(
    "join-room",
    async (data: {
      roomName: string;
      password: string;
      playerName: string;
    }) => {
      console.log("Server received join-room event:", data);
      await roomController.handleJoinRoom(socket, data);
    }
  );

  // Start game
  socket.on("start-game", async (selectedPlayerIds: string[]) => {
    console.log("Server received start-game event from socket:", socket.id);
    console.log("Selected players:", selectedPlayerIds);
    roomController.handleStartGame(socket, selectedPlayerIds);

    // Subscribe to Redis updates for this room after game starts
    const player = roomController["roomService"].getPlayer(socket.id);
    if (player) {
      console.log("Subscribing to Redis updates for room:", player.room);
      await roomController.subscribeToRoomUpdates(player.room);
    } else {
      console.log("No player found for socket:", socket.id);
    }
  });

  // Update selected players
  socket.on(
    "update-selected-players",
    (data: { selectedPlayers: string[] }) => {
      roomController.handleUpdateSelectedPlayers(socket, data);
    }
  );

  // Game update
  socket.on("game-update", (data: { ball: any; paddles: any; scores: any }) => {
    roomController.handleGameUpdate(socket, data);
  });

  // Get rooms list
  socket.on("get-rooms", () => {
    const rooms = roomController.getAllRooms();
    socket.emit("rooms-list", rooms);
  });

  // Back to lobby
  socket.on("back-to-lobby", () => {
    roomController.handleBackToLobby(socket);
  });

  // Leave room
  socket.on("leave-room", () => {
    roomController.handleDisconnect(socket);
  });

  // Disconnect
  socket.on("disconnect", async () => {
    roomController.handleDisconnect(socket);
  });
});

const PORT = process.env.SERVER_PORT || 3001;

// Initialize server and Redis
const startServer = async () => {
  console.log(
    "🔧 INITIALIZING SERVER - ID: " + (process.env.SERVER_ID || "default")
  );

  try {
    // Initialize Redis connection
    await initializeRedis();
    console.log("✅ Redis connected successfully");

    // Subscribe to primary server election messages (for all servers)
    await subscribeToPrimaryServerElection();
    console.log("✅ Subscribed to primary server election");

    // Handle primary server election and room recovery
    await handlePrimaryServerElection();
    console.log("✅ Primary server election completed");

    // Subscribe to all existing rooms (including lobby rooms)
    await subscribeToAllRooms();
    console.log("✅ Subscribed to existing rooms");

    // Start HTTP server
    server.listen(PORT, () => {
      console.log("=".repeat(60));
      console.log(
        `🚀 SERVER A STARTING UP - ID: ${process.env.SERVER_ID || "default"}`
      );
      console.log(
        `🌐 Server listening at ${process.env.DOMAIN}:${process.env.SERVER_PORT}`
      );
      console.log(
        `👥 Frontend at ${process.env.DOMAIN}:${process.env.FRONTEND_PORT}`
      );
      console.log(
        `🗄️ Redis connected at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
      );
      console.log("=".repeat(60));

      // Add a delay to ensure Redis is fully ready before election
      setTimeout(() => {
        handlePrimaryServerElection().catch((error) => {
          console.error("❌ Primary server election failed:", error);
        });
      }, 2000);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("=".repeat(60));
  console.log(
    "🛑 SERVER SHUTTING DOWN - ID: " + (process.env.SERVER_ID || "default")
  );
  console.log("🔄 Closing server connections...");

  server.close(async () => {
    console.log("🔌 Server HTTP closed");
    await closeRedis();
    console.log("🗄️ Redis connection closed");
    console.log("✅ Server fully shut down");
    console.log("=".repeat(60));
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startServer();
