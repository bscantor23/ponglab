import { Room } from "../models/Room";
import { Player } from "../models/Player";
import { publishRoomMetadata } from "../redis";

export class RoomService {
  private readonly rooms: Map<string, Room>;
  private readonly players: Map<string, Player>;
  private gameLoopInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.rooms = new Map();
    this.players = new Map();
    this.startGameLoop();
  }

  private startGameLoop(): void {
    // Run game physics at 120 FPS for smoother gameplay
    const targetFPS = 120;
    const frameTime = 1000 / targetFPS;
    let lastTime = Date.now();

    this.gameLoopInterval = setInterval(() => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      // Cap deltaTime to prevent large jumps
      const clampedDeltaTime = Math.min(deltaTime, 1 / 30); // Max 30 FPS step

      // Update all active games
      for (const room of this.rooms.values()) {
        if (room.isGameActive && !room.gameState?.winner) {
          room.updateGamePhysics(clampedDeltaTime);
        }
      }
    }, frameTime);
  }

  async createRoom(
    roomName: string,
    password: string,
    hostId: string,
    hostName: string
  ): Promise<Room> {
    // Validate room name length
    if (roomName.length > 20) {
      throw new Error("El nombre de la sala no puede exceder 20 caracteres.");
    }

    // Validate player name length
    if (hostName.length > 20) {
      throw new Error("El nombre del jugador no puede exceder 20 caracteres.");
    }

    if (this.rooms.has(roomName)) {
      throw new Error("Room already exists");
    }

    // Strict rule: Check if player name is already taken by ANY player
    const existingHost = Array.from(this.players.values()).find(
      (p) => p.name === hostName && p.id !== hostId
    );
    if (existingHost) {
      throw new Error(
        "El nombre de jugador ya está en uso. Por favor, elige otro nombre."
      );
    }

    const room = new Room(roomName, password, hostId, hostName);
    const host = new Player(hostId, hostName, roomName);

    // Ensure host status is set to true
    host.setHost(true);

    // Add as main player (not guest)
    room.addPlayer(hostId, host);
    this.rooms.set(roomName, room);
    this.players.set(hostId, host);

    console.log("Room created with single host assignment:", {
      roomName,
      hostId,
      hostName,
      hostPlayer: { id: host.id, name: host.name, isHost: host.isHost },
      roomPlayersCount: room.players.size,
      roomGuestsCount: room.guests.size,
    });

    try {
      await this.publishRoomMetadata(roomName);
    } catch (error) {
      console.error("❌ Failed to publish room metadata:", error);
    }

    return room;
  }

  async joinRoom(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Promise<Room> {
    console.log("RoomService.joinRoom called:", {
      roomName,
      playerId,
      playerName,
    });

    const room = this.rooms.get(roomName);

    if (!room) {
      return await this.joinRoomWithFailoverCheck(
        roomName,
        password,
        playerId,
        playerName
      );
    }

    // Use shared method for normal join logic
    return this.performNormalJoin(roomName, password, playerId, playerName);
  }

  leaveRoom(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    const roomName = player.room;
    const room = this.rooms.get(roomName);

    // Check if this is the host leaving
    const isHostLeaving = player.isHost;

    if (isHostLeaving) {
      console.log(
        `Host ${player.name} (${playerId}) leaving room ${roomName} - deleting room`
      );

      // Ensure host status is properly cleaned up
      player.setHost(false);

      // Remove player from room first
      if (room) {
        room.removePlayer(playerId);
      }

      // Delete the entire room when host leaves
      this.rooms.delete(roomName);

      console.log(`Room ${roomName} deleted because host left`);
    } else {
      // Regular player leaving - just remove them from the room
      console.log(
        `Player ${player.name} (${playerId}) leaving room ${roomName}`
      );

      if (room) {
        room.removePlayer(playerId);

        // Validate room still has correct host assignment if players remain
        this.validateRoomHostStatus(roomName);
      }
    }

    this.players.delete(playerId);
  }

  // Validate that a room has exactly one host
  private validateRoomHostStatus(roomName: string): void {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const allPlayers = [...room.players.values(), ...room.guests.values()];
    const hosts = allPlayers.filter((p) => p.isHost);

    if (hosts.length > 1) {
      console.warn(`Room ${roomName} has ${hosts.length} hosts, cleaning up`);
      this.ensureSingleHost(roomName);
    } else if (hosts.length === 0 && allPlayers.length > 0) {
      // If no host but players exist, we could optionally assign a new host
      // For now, just log the situation
      console.warn(
        `Room ${roomName} has no host but ${allPlayers.length} players exist`
      );
    }
  }

  startGame(
    roomName: string,
    hostId: string,
    selectedPlayerIds: string[]
  ): Room {
    console.log("RoomService.startGame called with:", {
      roomName,
      hostId,
      selectedPlayerIds,
    });

    const room = this.rooms.get(roomName);
    if (!room) {
      throw new Error("Room not found");
    }

    // Enhanced host verification with fallbacks
    let requestingPlayer = this.players.get(hostId);

    // Primary: If player found but doesn't have host status, check if they should be the host
    if (requestingPlayer && !requestingPlayer.isHost) {
      console.log(
        `Player found by socket ID but doesn't have host status, checking if they should be host...`
      );

      if (requestingPlayer.name === room.hostName) {
        console.log(
          `Restoring host status for original host ${requestingPlayer.name} (found by socket ID)`
        );
        this.ensureSingleHost(roomName);
        requestingPlayer.setHost(true);
      }
    }

    // Fallback: If player not found by socket ID, try to find by room and original host name
    if (!requestingPlayer) {
      console.log(
        `Player not found by socket ID ${hostId}, searching by room and host name...`
      );

      const allPlayersInRoom = Array.from(this.players.values()).filter(
        (p) => p.room === roomName
      );
      requestingPlayer = allPlayersInRoom.find((p) => p.name === room.hostName);

      if (requestingPlayer) {
        console.log(
          `Found original host by name: ${requestingPlayer.name} (${requestingPlayer.id})`
        );

        // Restore host status for original host if it was lost
        if (!requestingPlayer.isHost) {
          console.log(
            `Restoring host status for original host ${requestingPlayer.name}`
          );
          this.ensureSingleHost(roomName);
          requestingPlayer.setHost(true);
        }
      }
    }

    // Check host authorization with detailed logging
    if (!requestingPlayer) {
      console.error("No player found for host verification", {
        hostId,
        roomName,
        roomHostName: room.hostName,
        allPlayersInRoom: Array.from(this.players.values())
          .filter((p) => p.room === roomName)
          .map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
      });
      throw new Error("Player not found - please rejoin the room");
    }

    if (!requestingPlayer.isHost) {
      console.error("Host verification failed", {
        playerId: requestingPlayer.id,
        playerName: requestingPlayer.name,
        playerIsHost: requestingPlayer.isHost,
        roomHostName: room.hostName,
        hostId: hostId,
      });
      throw new Error("Unauthorized - Only the host can start the game");
    }

    // Additional validation: ensure player is in the correct room
    if (requestingPlayer.room !== roomName) {
      throw new Error("Player is not in the specified room");
    }

    console.log(
      `Host verification successful for ${requestingPlayer.name} (${requestingPlayer.id})`
    );

    const selectedPlayers = selectedPlayerIds
      .map((id) => {
        const player = this.players.get(id);
        console.log(
          "Looking for player",
          id,
          ":",
          player ? { id: player.id, name: player.name } : "not found"
        );
        return player;
      })
      .filter(Boolean) as Player[];

    if (selectedPlayers.length !== 2) {
      throw new Error("Must select exactly 2 players");
    }

    // Validate all selected players are in the room
    for (const player of selectedPlayers) {
      if (player.room !== roomName) {
        throw new Error(`Player ${player.name} is not in room ${roomName}`);
      }
    }

    room.startGame(selectedPlayers);
    return room;
  }

  updateGame(roomName: string, playerId: string, gameData: any): Room {
    const room = this.rooms.get(roomName);
    if (!room?.isGameActive) {
      throw new Error("Game not active");
    }

    // Only update paddles from client, physics handled server-side
    if (gameData.paddles) {
      room.gameState!.paddles = gameData.paddles;
    }
    return room;
  }

  restartGame(roomName: string, playerId: string): Room {
    const room = this.rooms.get(roomName);
    if (!room) {
      throw new Error("Room not found");
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Constant high speed with random direction towards opponents (compensating for deltaTime)
    // Angles around 45° towards players: 30°-60° and 120°-150°
    const isTowardsPlayer1 = Math.random() < 0.5;
    let angle;
    if (isTowardsPlayer1) {
      angle = Math.PI / 6 + Math.random() * (Math.PI / 6); // 30° to 60°
    } else {
      angle = (Math.PI * 2) / 3 + Math.random() * (Math.PI / 6); // 120° to 150°
    }
    const speed = 800; // High speed (compensates for 60 FPS deltaTime ~0.0167)
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Reset game state but keep players
    room.gameState = {
      players: room.gameState?.players || [],
      scores: { player1: 0, player2: 0 },
      ball: { x: 400, y: 300, vx, vy },
      paddles: { player1: 250, player2: 250 },
      winner: null,
    };
    room.isGameActive = true;

    return room;
  }

  backToLobby(roomName: string, playerId: string): Room {
    const room = this.rooms.get(roomName);
    if (!room) {
      throw new Error("Room not found");
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Reset game state and go back to lobby
    room.gameState = null;
    room.isGameActive = false;

    return room;
  }

  updateSelectedPlayers(roomName: string, selectedPlayers: string[]): void {
    const room = this.rooms.get(roomName);
    if (room) {
      room.selectedPlayers = selectedPlayers;
      // Log detailed player information
      const playerDetails = selectedPlayers.map((id) => {
        const player = this.players.get(id);
        return player
          ? { id: player.id, name: player.name }
          : `Player ${id} not found`;
      });
    } else {
      console.error("Room not found for selected players update:", roomName);
    }
  }

  getRoom(roomName: string): Room | undefined {
    return this.rooms.get(roomName);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  deleteRoom(roomName: string): void {
    this.rooms.delete(roomName);
  }

  getAllRooms(): any[] {
    return Array.from(this.rooms.values()).map((room) => room.toJSON());
  }

  // Add room from remote metadata (used by RoomController for Redis synchronization)
  addRoomFromMetadata(roomName: string, room: Room): void {
    this.rooms.set(roomName, room);
  }

  // Create room from metadata (used for primary server election)
  createRoomFromMetadata(roomName: string, metadata: any): Room {
    // Check if room already exists
    if (this.rooms.has(roomName)) {
      return this.rooms.get(roomName)!;
    }

    // Create room with original host information
    const room = new Room(
      roomName,
      metadata.password || "",
      metadata.hostId,
      metadata.hostName
    );

    // Add the room to the service
    this.addRoomFromMetadata(roomName, room);

    // Restore game state if it was active
    if (metadata.isGameActive && metadata.selectedPlayers) {
      room.isGameActive = metadata.isGameActive;
      room.selectedPlayers = metadata.selectedPlayers;
    }

    return room;
  }

  // Publish room metadata to Redis for cross-server synchronization
  async publishRoomMetadata(roomName: string): Promise<void> {
    const room = this.rooms.get(roomName);
    if (!room) {
      return;
    }

    const roomData = {
      name: room.name,
      hostName: room.hostName,
      hostId: room.hostId,
      password: room.password,
      isGameActive: room.isGameActive,
      selectedPlayers: room.selectedPlayers,
    };

    try {
      await publishRoomMetadata(roomName, roomData);
    } catch (error) {
      console.error("❌ Failed to publish room metadata:", error);
    }
  }

  // Ensure only one host per room by removing host status from all other players
  private ensureSingleHost(roomName: string): void {
    const room = this.rooms.get(roomName);
    if (!room) return;

    // Remove host status from all players in the room
    for (const player of room.players.values()) {
      if (player.isHost) {
        player.setHost(false);
      }
    }
    for (const player of room.guests.values()) {
      if (player.isHost) {
        player.setHost(false);
      }
    }

    // Also check global player map for any stray host references
    for (const player of this.players.values()) {
      if (player.room === roomName && player.isHost) {
        player.setHost(false);
      }
    }
  }

  // Shared method for normal room joining (used by both join methods)
  private performNormalJoin(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Room {
    // Validate player name length
    if (playerName.length > 20) {
      throw new Error("El nombre del jugador no puede exceder 20 caracteres.");
    }

    const room = this.rooms.get(roomName);
    if (!room) {
      throw new Error("Sala no encontrada");
    }

    // Check password
    if (room.password && room.password !== password) {
      throw new Error("Contraseña incorrecta");
    }

    // Strict rule: Check if player name is already taken by ANY player
    const conflictingPlayer = Array.from(this.players.values()).find(
      (p) => p.name === playerName && p.id !== playerId
    );

    if (conflictingPlayer) {
      throw new Error(
        "El nombre de jugador ya está en uso. Por favor, elige otro nombre."
      );
    }

    const player = new Player(playerId, playerName, roomName);

    const isOriginalHost = room.hostName === playerName;
    if (isOriginalHost) {
      // Ensure only one host by removing host status from all others
      this.ensureSingleHost(roomName);

      // Restore host status for original host
      player.setHost(true);
      room.addPlayer(playerId, player);
    } else {
      // Add as guest (regular player) - never set as host
      player.setHost(false);
      room.addGuest(playerId, player);
    }

    this.players.set(playerId, player);
    return room;
  }

  // Create room with host restoration enabled (new strategy)
  private async createRoomWithHostRestoration(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Promise<Room> {
    if (this.rooms.has(roomName)) {
      throw new Error("La sala ya existe");
    }

    // Get the original host information from Redis metadata
    const { getRoomMetadataFromRedis } = await import("../redis");
    const redisMetadata = await getRoomMetadataFromRedis(roomName);

    if (!redisMetadata) {
      throw new Error("Datos de la sala no encontrados");
    }

    // Create room with ORIGINAL host information from Redis
    // This preserves Alice's host status, not Bob's
    const room = new Room(
      roomName,
      password,
      redisMetadata.hostId, // Alice's original socket ID
      redisMetadata.hostName // Alice's original name
    );

    // Add the current player (Bob) as a guest initially
    const player = new Player(playerId, playerName, roomName);
    room.addGuest(playerId, player);
    this.rooms.set(roomName, room);
    this.players.set(playerId, player);

    try {
      await this.publishRoomMetadata(roomName);
    } catch (error) {
      console.error("❌ Failed to publish room metadata:", error);
    }

    return room;
  }

  // Enhanced joinRoom with host verification for failover scenarios
  async joinRoomWithFailoverCheck(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Promise<Room> {
    const localRoom = this.rooms.get(roomName);

    if (localRoom) {
      // Room exists locally, proceed with normal join logic using the shared method
      return this.performNormalJoin(roomName, password, playerId, playerName);
    }

    try {
      // Check if room metadata exists in Redis (indicating it exists on another server)
      const redisRoomExists = await this.checkRoomExistsInRedis(roomName);

      if (redisRoomExists) {
        // Create the room and then restore host status based on name
        const createdRoom = await this.createRoomWithHostRestoration(
          roomName,
          password,
          playerId,
          playerName
        );

        return createdRoom;
      } else {
        return await this.createRoom(roomName, password, playerId, playerName);
      }
    } catch (error) {
      throw new Error(
        "Unable to verify room existence due to network issues. " +
          "If you are the original host and this room should exist, " +
          "please try again in a few moments or contact support."
      );
    }
  }

  // Check if room metadata exists in Redis
  private async checkRoomExistsInRedis(roomName: string): Promise<boolean> {
    try {
      // Import the Redis check function
      const { checkRoomMetadataExists } = require("../redis");
      return await checkRoomMetadataExists(roomName);
    } catch (error) {
      console.error("Error checking Redis for room:", error);
      return false;
    }
  }

  // Force cleanup function for problematic scenarios
  forceCleanupPlayer(playerId: string, playerName: string): void {
    // Remove the specific player
    if (this.players.has(playerId)) {
      const player = this.players.get(playerId)!;
      const roomName = player.room;
      const isHostBeingCleanedUp = player.isHost;

      // Validate and handle host status cleanup
      if (isHostBeingCleanedUp) {
        console.log(
          `Force cleanup: Host ${playerName} (${playerId}) being removed from room ${roomName} - deleting room`
        );
        player.setHost(false);

        // Ensure host status is cleaned up in the room
        this.ensureSingleHost(roomName);
      }

      this.players.delete(playerId);

      // Also remove from their room if they have one
      const room = this.rooms.get(roomName);
      if (room) {
        room.removePlayer(playerId);

        if (isHostBeingCleanedUp) {
          // Delete the entire room when host is force cleaned up
          this.rooms.delete(roomName);
          console.log(
            `Room ${roomName} deleted because host was force cleaned up`
          );
        } else {
          // Validate room host status after cleanup
          this.validateRoomHostStatus(roomName);
        }
      }
    }

    // Also check for any other players with the same name and remove them
    const playersWithSameName = Array.from(this.players.entries()).filter(
      ([id, player]) => player.name === playerName && id !== playerId
    );

    if (playersWithSameName.length > 0) {
      console.log(
        `Force cleanup: Found ${playersWithSameName.length} duplicate players with name ${playerName}, removing them`
      );

      playersWithSameName.forEach(([id, player]) => {
        const roomName = player.room;
        const isDuplicateHost = player.isHost;

        // Handle host status for duplicates
        if (isDuplicateHost) {
          console.log(
            `Force cleanup: Duplicate host ${playerName} (${id}) being removed from room ${roomName} - deleting room`
          );
          player.setHost(false);
          this.ensureSingleHost(roomName);
        }

        this.players.delete(id);

        const room = this.rooms.get(roomName);
        if (room) {
          room.removePlayer(id);

          if (isDuplicateHost) {
            // Delete the entire room when duplicate host is force cleaned up
            this.rooms.delete(roomName);
            console.log(
              `Room ${roomName} deleted because duplicate host was force cleaned up`
            );
          } else {
            this.validateRoomHostStatus(roomName);
          }
        }
      });
    }
  }
}
