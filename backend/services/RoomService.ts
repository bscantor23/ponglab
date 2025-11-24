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
    // Run game physics at 60 FPS
    const targetFPS = 60;
    const frameTime = 1000 / targetFPS;
    let lastTime = Date.now();

    this.gameLoopInterval = setInterval(() => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      // Update all active games
      for (const room of this.rooms.values()) {
        if (room.isGameActive && !room.gameState?.winner) {
          room.updateGamePhysics(deltaTime);
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
    if (this.rooms.has(roomName)) {
      throw new Error("Room already exists");
    }

    const room = new Room(roomName, password, hostId, hostName);
    const host = new Player(hostId, hostName, roomName);
    host.setHost(true);

    room.addPlayer(hostId, host);
    this.rooms.set(roomName, room);
    this.players.set(hostId, host);

    console.log("Room created with host preservation:", {
      roomName,
      hostId,
      hostName,
      hostPlayer: { id: host.id, name: host.name, isHost: host.isHost },
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

    const room = this.rooms.get(player.room);
    if (room) {
      room.removePlayer(playerId);
      if (room.players.size === 0) {
        this.rooms.delete(player.room);
      }
    }
    this.players.delete(playerId);
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

    // Enhanced host verification: Check both socket ID AND host status
    const requestingPlayer = this.players.get(hostId);

    // Check if player has host status or matches the room's original host name
    // Primary check: player name matches room's original host name
    const isOriginalHost = room.hostName === requestingPlayer?.name;
    const hasHostStatus = requestingPlayer?.isHost === true;
    const isAuthorizedHost = isOriginalHost || hasHostStatus;

    if (!isAuthorizedHost) {
      throw new Error("Unauthorized - Only the host can start the game");
    }

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

  // Shared method for normal room joining (used by both join methods)
  private performNormalJoin(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Room {
    const room = this.rooms.get(roomName);
    if (!room) {
      throw new Error("Room not found");
    }

    // Check password
    if (room.password && room.password !== password) {
      throw new Error("Incorrect password");
    }

    // Check if player name is already taken globally by a DIFFERENT player
    const conflictingPlayer = Array.from(this.players.values()).find(
      (p) => p.name === playerName && p.id !== playerId
    );

    if (conflictingPlayer) {
      // Try to remove conflicting player if they're in a different room or stale
      if (conflictingPlayer.room !== roomName) {
        this.leaveRoom(conflictingPlayer.id);
      } else {
        this.leaveRoom(conflictingPlayer.id);
      }

      // Retry the check after cleanup
      const stillConflicting = Array.from(this.players.values()).find(
        (p) => p.name === playerName && p.id !== playerId
      );

      if (stillConflicting) {
        throw new Error("El nombre de jugador ya está en uso.");
      } else {
        console.log("Cleanup successful, proceeding with join");
      }
    }

    const player = new Player(playerId, playerName, roomName);

    // Check if this is the original host rejoining after failover
    // Use hostName for identification (more reliable across server reconnections)
    const isOriginalHost = room.hostName === playerName;
    if (isOriginalHost) {
      // Restore host status for original host
      player.setHost(true);
      room.addPlayer(playerId, player);
    } else {
      // Add as guest (regular player)
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
      throw new Error("Room already exists");
    }

    // Get the original host information from Redis metadata
    const { getRoomMetadataFromRedis } = await import("../redis");
    const redisMetadata = await getRoomMetadataFromRedis(roomName);

    if (!redisMetadata) {
      throw new Error("Room metadata not found in Redis");
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
      this.players.delete(playerId);

      // Also remove from their room if they have one
      const room = this.rooms.get(player.room);
      if (room) {
        room.removePlayer(playerId);
      }
    }

    // Also check for any other players with the same name and remove them
    const playersWithSameName = Array.from(this.players.entries()).filter(
      ([id, player]) => player.name === playerName && id !== playerId
    );

    if (playersWithSameName.length > 0) {
      playersWithSameName.forEach(([id, player]) => {
        this.players.delete(id);

        const room = this.rooms.get(player.room);
        if (room) {
          room.removePlayer(id);
        }
      });
    }
  }
}
