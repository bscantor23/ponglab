import { RoomService } from "../services/RoomService";
import * as socketIo from "socket.io";

interface JoinRoomData {
  roomName: string;
  password: string;
  playerName: string;
}

interface GameUpdateData {
  ball: any;
  paddles: any;
  scores: any;
}

interface UpdateSelectedPlayersData {
  selectedPlayers: string[];
}

export class RoomController {
  private readonly roomService: RoomService;
  private readonly io: socketIo.Server;

  constructor(io: socketIo.Server) {
    this.roomService = new RoomService();
    this.io = io;
  }

  handleJoinRoom(socket: socketIo.Socket, data: JoinRoomData): void {
    try {
      const { roomName, password, playerName } = data;
      const room = this.roomService.joinRoom(
        roomName,
        password,
        socket.id,
        playerName
      );

      const isHost = room.hostId === socket.id;
      socket.emit("room-joined", { success: true, isHost, room: roomName });
      socket.join(roomName);

      const roomData = {
        name: room.name,
        players: Array.from(room.players.values()).map((p) => p.toJSON()),
        guests: Array.from(room.guests.values()).map((p) => p.toJSON()),
        gameState: room.gameState,
        isGameActive: room.isGameActive,
        selectedPlayers: room.selectedPlayers,
      };
      socket.emit("room-update", roomData);
      this.broadcastRoomUpdate(socket, roomName);
    } catch (error: any) {
      socket.emit("room-joined", { success: false, message: error.message });
    }
  }

  handleStartGame(socket: socketIo.Socket, selectedPlayerIds: string[]): void {
    try {
      const player = this.roomService.getPlayer(socket.id);
      if (!player) return;

      const room = this.roomService.startGame(
        player.room,
        socket.id,
        selectedPlayerIds
      );
      room.selectedPlayers = []; // Reset selected players for new game
      socket.emit("game-started", room.gameState);
      socket.to(player.room).emit("game-started", room.gameState);
      this.broadcastRoomUpdate(socket, player.room);
    } catch (error: any) {
      socket.emit("error", { message: error.message });
    }
  }

  handleGameUpdate(socket: socketIo.Socket, data: GameUpdateData): void {
    try {
      const player = this.roomService.getPlayer(socket.id);
      if (!player) return;

      const room = this.roomService.getRoom(player.room);
      if (!room?.isGameActive) {
        throw new Error("Game not active");
      }

      if (data.paddles) {
        room.gameState!.paddles = data.paddles;
      }
    } catch (error: any) {
      socket.emit("error", { message: error.message });
    }
  }


  handleBackToLobby(socket: socketIo.Socket): void {
    try {
      const player = this.roomService.getPlayer(socket.id);
      if (!player) return;

      const room = this.roomService.backToLobby(player.room, socket.id);
      this.broadcastRoomUpdate(socket, player.room);
    } catch (error: any) {
      socket.emit("error", { message: error.message });
    }
  }

  handleUpdateSelectedPlayers(
    socket: socketIo.Socket,
    data: UpdateSelectedPlayersData
  ): void {
    try {
      console.log("handleUpdateSelectedPlayers data:", data);
      const player = this.roomService.getPlayer(socket.id);
      if (!player) return;
      console.log("player.room:", player.room);

      this.roomService.updateSelectedPlayers(player.room, data.selectedPlayers);
      const room = this.roomService.getRoom(player.room);
      if (room) {
        const roomData = {
          name: room.name,
          players: Array.from(room.players.values()).map((p) => p.toJSON()),
          guests: Array.from(room.guests.values()).map((p) => p.toJSON()),
          gameState: room.gameState,
          isGameActive: room.isGameActive,
          selectedPlayers: room.selectedPlayers,
        };
        socket.emit("room-update", roomData);
        this.broadcastRoomUpdate(socket, player.room);
      }
    } catch (error: any) {
      socket.emit("error", { message: error.message });
    }
  }

  handleDisconnect(socket: socketIo.Socket): void {
    const player = this.roomService.getPlayer(socket.id);
    if (player) {
      const room = this.roomService.getRoom(player.room);
      if (room) {
        if (room.isGameActive && room.gameState) {
          const isPlayer = room.gameState.players.some(p => p.id === socket.id);
          if (isPlayer) {
            const otherPlayer = room.gameState.players.find(p => p.id !== socket.id);
            if (otherPlayer) {
              room.gameState.winner = otherPlayer.id;
            }
            this.broadcastRoomUpdate(socket, player.room);
          }
        }
        if (player.id === room.hostId) {
          // Host disconnected, delete room
          this.roomService.deleteRoom(player.room);
          socket.to(player.room).emit('room-deleted');
          socket.emit('room-deleted');
        } else {
          this.roomService.leaveRoom(socket.id);
          this.broadcastRoomUpdate(socket, player.room);
        }
      } else {
        this.roomService.leaveRoom(socket.id);
      }
    } else {
      this.roomService.leaveRoom(socket.id);
    }
  }

  broadcastRoomUpdate(socket: socketIo.Socket, roomName: string): void {
    const room = this.roomService.getRoom(roomName);
    if (room) {
      const data = {
        name: room.name,
        players: Array.from(room.players.values()).map((p) => p.toJSON()),
        guests: Array.from(room.guests.values()).map((p) => p.toJSON()),
        gameState: room.gameState,
        isGameActive: room.isGameActive,
        selectedPlayers: room.selectedPlayers,
      };
      console.log("broadcastRoomUpdate to room:", roomName, "data:", data);
      socket.broadcast.to(roomName).emit("room-update", data);
    }
  }

  getAllRooms(): any[] {
    return this.roomService.getAllRooms();
  }
}
