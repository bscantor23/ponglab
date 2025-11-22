import { Room } from "../models/Room";
import { Player } from "../models/Player";

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

  createRoom(
    roomName: string,
    password: string,
    hostId: string,
    hostName: string
  ): Room {
    if (this.rooms.has(roomName)) {
      throw new Error("Room already exists");
    }

    const room = new Room(roomName, password, hostId);
    const host = new Player(hostId, hostName, roomName);
    host.setHost(true);

    room.addPlayer(hostId, host);
    this.rooms.set(roomName, room);
    this.players.set(hostId, host);

    return room;
  }

  joinRoom(
    roomName: string,
    password: string,
    playerId: string,
    playerName: string
  ): Room {
    const room = this.rooms.get(roomName);

    if (!room) {
      // Create new room if it doesn't exist
      return this.createRoom(roomName, password, playerId, playerName);
    }

    // Check password
    if (room.password && room.password !== password) {
      throw new Error("Incorrect password");
    }

    // Check if player name is already taken globally
    const nameTaken = Array.from(this.players.values()).some(
      (p) => p.name === playerName
    );
    if (nameTaken) {
      throw new Error("El nombre de jugador ya está en uso.");
    }

    const player = new Player(playerId, playerName, roomName);
    room.addGuest(playerId, player);
    this.players.set(playerId, player);

    return room;
  }

  leaveRoom(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

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
    const room = this.rooms.get(roomName);
    if (room?.hostId !== hostId) {
      throw new Error("Unauthorized");
    }

    const selectedPlayers = selectedPlayerIds
      .map((id) => this.players.get(id))
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
      angle = Math.PI * 2 / 3 + Math.random() * (Math.PI / 6); // 120° to 150°
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
      winner: null
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
}
