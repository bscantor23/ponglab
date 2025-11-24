import express from "express";
import http from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { RoomController } from "./controllers/RoomController";

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: `${process.env.DOMAIN || "http://localhost"}`,
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const roomController = new RoomController(io);

// Broadcast game state updates at 60 FPS
setInterval(() => {
  const rooms = roomController.getAllRooms();
  rooms.forEach((room: any) => {
    if (room.isGameActive && room.gameState) {
      io.to(room.name).emit("game-update", room.gameState);
    }
  });
}, 1000 / 60); // 60 FPS

// Socket.IO connection handling
io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on(
    "join-room",
    (data: { roomName: string; password: string; playerName: string }) => {
      roomController.handleJoinRoom(socket, data);
    }
  );

  // Start game
  socket.on("start-game", (selectedPlayerIds: string[]) => {
    roomController.handleStartGame(socket, selectedPlayerIds);
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
  socket.on("disconnect", () => {
    roomController.handleDisconnect(socket);
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.SERVER_PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `Accepting connections at ${process.env.DOMAIN}:${process.env.SERVER_PORT}`
  );
  console.log(`Clients at ${process.env.DOMAIN}:${process.env.FRONTEND_PORT}`);
});
