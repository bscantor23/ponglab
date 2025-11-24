import { Player } from "./Player";

interface GameState {
  players: Player[];
  scores: { player1: number; player2: number };
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastTouched?: "player1" | "player2";
  };
  paddles: { player1: number; player2: number };
  winner: string | null;
  timestamp?: number;
}

export class Room {
  public name: string;
  public password: string | null;
  public hostName: string;
  public hostId: string; // Keep for backward compatibility during migration
  public players: Map<string, Player>;
  public guests: Map<string, Player>;
  public gameState: GameState | null;
  public isGameActive: boolean;
  public selectedPlayers: string[];

  constructor(name: string, password: string, hostId: string, hostName: string) {
    this.name = name;
    this.password = password;
    this.hostId = hostId;
    this.hostName = hostName; // New primary host identification
    this.players = new Map();
    this.guests = new Map();
    this.gameState = null;
    this.isGameActive = false;
    this.selectedPlayers = [];
  }

  addPlayer(playerId: string, player: Player): void {
    this.players.set(playerId, player);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.guests.delete(playerId);
  }

  addGuest(playerId: string, player: Player): void {
    this.guests.set(playerId, player);
  }

  startGame(selectedPlayers: Player[]): void {
    // Constant high speed with random direction towards opponents (compensating for deltaTime)
    // Angles around 45° towards players: 30°-60° and 120°-150°
    const isTowardsPlayer1 = Math.random() < 0.5;
    let angle;
    if (isTowardsPlayer1) {
      angle = Math.PI / 6 + Math.random() * (Math.PI / 6); // 30° to 60°
    } else {
      angle = Math.PI * 2 / 3 + Math.random() * (Math.PI / 6); // 120° to 150°
    }
    const speed = 500; // High speed (compensates for 60 FPS deltaTime ~0.0167)
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.gameState = {
      players: selectedPlayers,
      scores: { player1: 0, player2: 0 },
      ball: { x: 400, y: 300, vx, vy },
      paddles: { player1: 250, player2: 250 },
      winner: null,
      timestamp: Date.now(),
    };
    this.isGameActive = true;
  }

  updateGame(ball: any, paddles: any, scores: any): void {
    if (this.gameState) {
      this.gameState.ball = ball;
      this.gameState.paddles = paddles;
      this.gameState.scores = scores;
      this.gameState.timestamp = Date.now();

      // Check for winner
      if (scores.player1 >= 10 || scores.player2 >= 10) {
        this.gameState.winner = scores.player1 >= 10 ? "player1" : "player2";
      }
    }
  }

  // Server-side game physics update
  updateGamePhysics(deltaTime: number): void {
    if (!this.gameState || !this.isGameActive) return;

    const ball = this.gameState.ball;
    const paddles = this.gameState.paddles;
    const scores = this.gameState.scores;

    // Ball movement
    ball.x += ball.vx * deltaTime;
    ball.y += ball.vy * deltaTime;

    // Ball collision with top/bottom
    if (ball.y <= 10 || ball.y >= 590) {
      ball.vy = -ball.vy;
    }

    // Ball collision with paddles
    if (
      ball.x <= 30 &&
      ball.y >= paddles.player1 &&
      ball.y <= paddles.player1 + 100
    ) {
      ball.vx = -ball.vx;
      ball.lastTouched = "player1";
    } else if (
      ball.x >= 770 &&
      ball.y >= paddles.player2 &&
      ball.y <= paddles.player2 + 100
    ) {
      ball.vx = -ball.vx;
      ball.lastTouched = "player2";
      // Add slight random variation to vy for variety
      ball.vy += (Math.random() - 0.5) * 2;
    }

    // Scoring
    if (ball.x < 0) {
      scores.player2++;
      // Reset ball towards player 1 (left side) - angles around 45°: 30° to 60°
      const angle = Math.PI / 6 + Math.random() * (Math.PI / 6); // 30° to 60°
      const speed = 500; // High speed (compensates for 60 FPS deltaTime)
      ball.x = 400;
      ball.y = 300;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
    } else if (ball.x > 800) {
      scores.player1++;
      // Reset ball towards player 2 (right side) - angles around 135°: 120° to 150°
      const angle = Math.PI * 2 / 3 + Math.random() * (Math.PI / 6); // 120° to 150°
      const speed = 500; // High speed (compensates for 60 FPS deltaTime)
      ball.x = 400;
      ball.y = 300;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
    }

    // Check for winner
    if (scores.player1 >= 5 || scores.player2 >= 5) {
      this.gameState.winner = scores.player1 >= 5 ? "player1" : "player2";
    }

    this.gameState.timestamp = Date.now();
  }

  toJSON(): any {
    return {
      name: this.name,
      hostName: this.hostName,
      hostId: this.hostId, // Keep for backward compatibility
      players: Array.from(this.players.values()),
      guests: Array.from(this.guests.values()),
      gameState: this.gameState,
      isGameActive: this.isGameActive,
      selectedPlayers: this.selectedPlayers,
    };
  }
}


