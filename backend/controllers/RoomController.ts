import { RoomService } from "../services/RoomService";
import { Room } from "../models/Room";
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

  async handleJoinRoom(
    socket: socketIo.Socket,
    data: JoinRoomData
  ): Promise<void> {
    try {
      const { roomName, password, playerName } = data;

      // Use failover-safe room joining for enhanced security
      const room = await this.roomService.joinRoomWithFailoverCheck(
        roomName,
        password,
        socket.id,
        playerName
      );
      console.log(
        "Room joined successfully:",
        room.name,
        "hostName:",
        room.hostName,
        "hostId:",
        room.hostId
      );

      // Use hostName for host identification (more reliable across server reconnections)
      const isHost = room.hostName === playerName;
      socket.emit("room-joined", { success: true, isHost, room: roomName });
      socket.join(roomName);

      const roomData = {
        name: room.name,
        hostName: room.hostName,
        hostId: room.hostId, // Keep for backward compatibility
        players: Array.from(room.players.values()).map((p) => p.toJSON()),
        guests: Array.from(room.guests.values()).map((p) => p.toJSON()),
        gameState: room.gameState,
        isGameActive: room.isGameActive,
        selectedPlayers: room.selectedPlayers,
      };
      console.log(
        "Sending room-update to socket:",
        socket.id,
        "roomData:",
        roomData
      );
      socket.emit("room-update", roomData);
      console.log("Broadcasting room update to room:", roomName);
      this.broadcastRoomUpdate(socket, roomName);
    } catch (error: any) {
      console.error("Error in handleJoinRoom:", error);
      socket.emit("room-joined", { success: false, message: error.message });
    }
  }

  handleStartGame(socket: socketIo.Socket, selectedPlayerIds: string[]): void {
    console.log("RoomController handleStartGame called");
    console.log("Socket ID:", socket.id);
    console.log("Selected players:", selectedPlayerIds);

    try {
      const player = this.roomService.getPlayer(socket.id);
      console.log(
        "Player found:",
        player
          ? {
              id: player.id,
              name: player.name,
              room: player.room,
              isHost: player.isHost,
            }
          : null
      );

      if (!player) {
        console.error("Player not found for socket:", socket.id);
        socket.emit("error", { message: "Player not found" });
        return;
      }

      const room = this.roomService.getRoom(player.room);
      console.log(
        "Room found:",
        room
          ? {
              name: room.name,
              hostId: room.hostId,
              isGameActive: room.isGameActive,
            }
          : null
      );

      if (!room) {
        console.error("Room not found:", player.room);
        socket.emit("error", { message: "Room not found" });
        return;
      }

      console.log("Calling roomService.startGame with:", {
        roomName: player.room,
        hostId: socket.id,
        selectedPlayerIds,
      });
      const result = this.roomService.startGame(
        player.room,
        socket.id,
        selectedPlayerIds
      );

      console.log("RoomService.startGame returned:", result);

      room.selectedPlayers = []; // Reset selected players for new game
      console.log("Emitting game-started event");
      socket.emit("game-started", room.gameState);
      socket.to(player.room).emit("game-started", room.gameState);
      this.broadcastRoomUpdate(socket, player.room);

      console.log("Game start process completed successfully");
    } catch (error: any) {
      console.error("Error in handleStartGame:", error);
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
      if (!player) {
        console.log("Player not found for socket:", socket.id);
        return;
      }
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
        console.log(
          "Sending room-update to socket:",
          socket.id,
          "selectedPlayers:",
          roomData.selectedPlayers
        );
        socket.emit("room-update", roomData);
        console.log("Broadcasting room-update to room:", player.room);
        this.broadcastRoomUpdate(socket, player.room);
      } else {
        console.error("Room not found after update:", player.room);
      }
    } catch (error: any) {
      console.error("Error in handleUpdateSelectedPlayers:", error);
      socket.emit("error", { message: error.message });
    }
  }

  handleDisconnect(socket: socketIo.Socket): void {
    console.log("handleDisconnect called for socket:", socket.id);
    const player = this.roomService.getPlayer(socket.id);
    console.log(
      "Player found on disconnect:",
      player ? { id: player.id, name: player.name, room: player.room } : null
    );

    if (player) {
      const room = this.roomService.getRoom(player.room);
      console.log(
        "Room found on disconnect:",
        room
          ? { name: room.name, hostName: room.hostName, hostId: room.hostId }
          : null
      );

      if (room) {
        if (room.isGameActive && room.gameState) {
          const isPlayer = room.gameState.players.some(
            (p) => p.id === socket.id
          );
          console.log("Player in active game:", isPlayer);
          if (isPlayer) {
            const otherPlayer = room.gameState.players.find(
              (p) => p.id !== socket.id
            );
            if (otherPlayer) {
              room.gameState.winner = otherPlayer.id;
              console.log("Setting winner due to disconnect:", otherPlayer.id);
            }
            this.broadcastRoomUpdate(socket, player.room);
          }
        }

        // Check host disconnection using both hostName (primary) and hostId (fallback)
        const isHostDisconnect =
          player.name === room.hostName || player.id === room.hostId;
        if (isHostDisconnect) {
          // Host disconnected, delete room
          console.log("Host disconnected, deleting room:", player.room);
          this.roomService.deleteRoom(player.room);
          socket.to(player.room).emit("room-deleted");
          socket.emit("room-deleted");
        } else {
          console.log("Regular player disconnecting, removing from room");
          this.roomService.leaveRoom(socket.id);
          this.broadcastRoomUpdate(socket, player.room);
        }
      } else {
        console.log("No room found, just removing player from global map");
        this.roomService.leaveRoom(socket.id);
      }

      // Force cleanup to ensure no stale entries remain
      console.log("Performing force cleanup for disconnected player");
      this.roomService.forceCleanupPlayer(player.id, player.name);
    } else {
      console.log("No player found for socket, attempting cleanup");
      this.roomService.leaveRoom(socket.id);
    }
  }

  broadcastRoomUpdate(socket: socketIo.Socket, roomName: string): void {
    const room = this.roomService.getRoom(roomName);
    if (room) {
      const data = {
        name: room.name,
        hostName: room.hostName,
        hostId: room.hostId, // Keep for backward compatibility
        players: Array.from(room.players.values()).map((p) => p.toJSON()),
        guests: Array.from(room.guests.values()).map((p) => p.toJSON()),
        gameState: room.gameState,
        isGameActive: room.isGameActive,
        selectedPlayers: room.selectedPlayers,
      };
      console.log("broadcastRoomUpdate to room:", roomName, "data:", data);

      // Send to all clients in the room including the sender
      this.io.to(roomName).emit("room-update", data);
      console.log("Room update broadcasted to all clients in room:", roomName);
    } else {
      console.error("Room not found for broadcast:", roomName);
    }
  }

  getAllRooms(): any[] {
    return this.roomService.getAllRooms();
  }

  updateRoomState(roomName: string, state: any): void {
    try {
      const room = this.roomService.getRoom(roomName);
      if (!room) return;

      const remoteTimestamp = state.timestamp;
      const localTimestamp = room.gameState?.timestamp || 0;

      // Only update if remote state is newer or if we don't have local state
      if (remoteTimestamp > localTimestamp || !room.gameState) {
        // Check if this server is the leader (has more players in the room)
        const thisServerPlayerCount = room.players.size + room.guests.size;
        const remoteServerId = state.serverId;
        const thisServerId = process.env.SERVER_ID || "default-server";

        // If remote server is different and has more recent state, sync it
        if (
          remoteServerId !== thisServerId &&
          remoteTimestamp > localTimestamp
        ) {
          room.gameState = {
            ...state.state,
            timestamp: remoteTimestamp,
          };
          room.isGameActive = true;

          // Broadcast the updated state to all clients in the room
          this.io.to(roomName).emit("game-update", room.gameState);
        }
      }
    } catch (error: any) {
      console.error("Failed to update room state:", error.message);
    }
  }

  updateRoomMetadata(roomName: string, metadata: any): void {
    try {
      const remoteTimestamp = metadata.timestamp;
      const remoteServerId = metadata.serverId;
      const thisServerId = process.env.SERVER_ID || "default-server";
      const roomData = metadata.roomData;

      console.log(
        `Received room metadata for ${roomName} from ${remoteServerId}:`,
        {
          hostName: roomData.hostName,
          hostId: roomData.hostId,
          timestamp: remoteTimestamp,
        }
      );

      // Always create room from remote metadata if it doesn't exist locally
      let room = this.roomService.getRoom(roomName);
      if (!room) {
        console.log(
          `Room ${roomName} doesn't exist locally, creating from remote metadata from ${remoteServerId}`
        );

        // Create room with remote metadata
        room = new Room(
          roomData.name,
          roomData.password,
          roomData.hostId,
          roomData.hostName
        );

        // Add room to RoomService using the public method
        this.roomService.addRoomFromMetadata(roomName, room);

        console.log(`✅ Created room ${roomName} from remote metadata:`, {
          hostName: room.hostName,
          hostId: room.hostId,
          sourceServer: remoteServerId,
        });

        // Broadcast the new room to all clients on this server
        this.broadcastRoomUpdate({} as socketIo.Socket, roomName);
      } else {
        console.log(
          `Room ${roomName} already exists locally, checking for updates`
        );

        // Update hostName if different and from different server
        if (
          remoteServerId !== thisServerId &&
          roomData.hostName !== room.hostName
        ) {
          console.log(
            `🔄 Updating hostName from "${room.hostName}" to "${roomData.hostName}" (from ${remoteServerId})`
          );
          room.hostName = roomData.hostName;

          // Broadcast updated room info
          this.broadcastRoomUpdate({} as socketIo.Socket, roomName);
        }
      }

      console.log(
        `📡 Room ${roomName} metadata processed from server ${remoteServerId}`
      );
    } catch (error: any) {
      console.error("❌ Failed to update room metadata:", error.message);
    }
  }

  // Subscribe to Redis for room state updates
  async subscribeToRoomUpdates(roomName: string): Promise<void> {
    const { subscribeToGameState, subscribeToRoomMetadata } = await import(
      "../redis"
    );

    // Subscribe to game state updates
    await subscribeToGameState(roomName, (data) => {
      this.updateRoomState(roomName, data);
    });

    // Subscribe to room metadata updates
    await subscribeToRoomMetadata(roomName, (data) => {
      this.updateRoomMetadata(roomName, data);
    });
  }

  // Unsubscribe from Redis room updates
  async unsubscribeFromRoomUpdates(roomName: string): Promise<void> {
    const { unsubscribeFromGameState, unsubscribeFromRoomMetadata } =
      await import("../redis");

    await unsubscribeFromGameState(roomName);
    await unsubscribeFromRoomMetadata(roomName);
  }

  // Create room from metadata (used for primary server election)
  createRoomFromMetadata(roomName: string, metadata: any): Room {
    console.log(`🏗️ Creating room ${roomName} from metadata:`, {
      hostName: metadata.hostName,
      hostId: metadata.hostId,
      password: metadata.password ? "***" : "none",
    });

    // Use RoomService to create the room with original host information
    const room = this.roomService.createRoomFromMetadata(roomName, metadata);

    // Subscribe to room updates for synchronization
    this.subscribeToRoomUpdates(roomName).catch((error) => {
      console.error(`Failed to subscribe to room ${roomName} updates:`, error);
    });

    return room;
  }

  // Clean up all rooms (used when backup server receives primary election)
  cleanupAllRooms(): void {
    console.log("🧹 Cleaning up all rooms on backup server");
    const rooms = this.roomService.getAllRooms();

    for (const room of rooms) {
      console.log(`Deleting room: ${room.name}`);

      // Clean up all players in the room first
      const allPlayers = [...room.players.keys(), ...room.guests.keys()];
      for (const playerId of allPlayers) {
        const player = this.roomService.getPlayer(playerId);
        if (player) {
          console.log(`Removing player: ${player.name} from room cleanup`);
          this.roomService.leaveRoom(playerId);
        }
      }

      this.roomService.deleteRoom(room.name);
    }

    console.log(
      `✅ Cleaned up ${rooms.length} rooms and all associated players`
    );
  }
}
