import { useEffect, useRef, useState } from "react";

interface GameState {
  players: any[];
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

interface InterpolatedState {
  ball: { x: number; y: number };
  paddles: { player1: number; player2: number };
}

interface GameProps {
  readonly gameState: GameState;
  readonly onUpdate: (ball: any, paddles: any, scores: any) => void;
  readonly socketId?: string;
  readonly onBackToLobby?: () => void;
  readonly isWinner?: boolean;
  readonly isHost?: boolean;
}

function Game({
  gameState,
  onUpdate,
  socketId,
  onBackToLobby,
  isWinner,
  isHost,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paddleY, setPaddleY] = useState<number>(250);
  const [lastSentPaddleY, setLastSentPaddleY] = useState<number>(250);
  const [ballTrail, setBallTrail] = useState<Array<{ x: number; y: number }>>(
    []
  );
  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [interpolatedState, setInterpolatedState] =
    useState<InterpolatedState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      // Clear canvas with fade effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw ball trail
      for (let index = 0; index < ballTrail.length; index++) {
        const pos = ballTrail[index];
        const alpha = (index / ballTrail.length) * 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8 - index * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Use interpolated positions for smooth rendering
      const currentPaddles = interpolatedState?.paddles || gameState.paddles;
      const currentBall = interpolatedState?.ball || gameState.ball;

      // Left paddle (player1) is always pink, right paddle (player2) is always blue
      ctx.shadowColor = "#ff69b4";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ff69b4";
      ctx.fillRect(10, currentPaddles.player1, 10, 100);

      ctx.shadowColor = "#61dafb";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#61dafb";
      ctx.fillRect(canvas.width - 20, currentPaddles.player2, 10, 100);
      ctx.shadowBlur = 0;

      // Draw ball with color based on last touched player
      const ballColor =
        gameState.ball.lastTouched === "player1" ? "#ff69b4" : "#61dafb";
      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(currentBall.x, currentBall.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Draw player names and scores
      ctx.font = "bold 24px Montserrat";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";

      // Player 1 name and score
      const player1Name = gameState.players[0]?.name || "Player 1";
      ctx.fillText(player1Name, canvas.width / 4, 40);
      ctx.font = "bold 36px Montserrat";
      ctx.fillText(gameState.scores.player1.toString(), canvas.width / 4, 70);

      // Player 2 name and score
      ctx.font = "bold 24px Montserrat";
      const player2Name = gameState.players[1]?.name || "Player 2";
      ctx.fillText(player2Name, (3 * canvas.width) / 4, 40);
      ctx.font = "bold 36px Montserrat";
      ctx.fillText(
        gameState.scores.player2.toString(),
        (3 * canvas.width) / 4,
        70
      );

      ctx.textAlign = "start";

      // Draw center line
      ctx.setLineDash([5, 15]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.setLineDash([]);
    };

    draw();
  }, [gameState, ballTrail, interpolatedState]);

  useEffect(() => {
    // Only allow paddle control if this user is one of the active players
    const isActivePlayer = gameState.players.some(
      (player: any) => player.id === socketId
    );

    if (!isActivePlayer) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && paddleY > 0) {
        e.preventDefault();
        setPaddleY((prev) => Math.max(0, prev - 15));
      } else if (e.key === "ArrowDown" && paddleY < 500) {
        e.preventDefault();
        setPaddleY((prev) => Math.min(500, prev + 15));
      }
    };

    globalThis.addEventListener("keydown", handleKeyPress);
    return () => globalThis.removeEventListener("keydown", handleKeyPress);
  }, [paddleY, gameState.players, socketId]);

  // Send paddle updates only when position changes
  useEffect(() => {
    if (Math.abs(paddleY - lastSentPaddleY) > 1) {
      // Small threshold to avoid spam
      const isActivePlayer = gameState.players.some(
        (player: any) => player.id === socketId
      );
      if (isActivePlayer) {
        const isPlayer1 = gameState.players[0]?.id === socketId;
        const isPlayer2 = gameState.players[1]?.id === socketId;
        if (isPlayer1) {
          onUpdate(
            null,
            { player1: paddleY, player2: gameState.paddles.player2 },
            null
          );
        } else if (isPlayer2) {
          onUpdate(
            null,
            { player1: gameState.paddles.player1, player2: paddleY },
            null
          );
        }
        setLastSentPaddleY(paddleY);
      }
    }
  }, [
    paddleY,
    lastSentPaddleY,
    gameState.players,
    gameState.paddles,
    socketId,
    onUpdate,
  ]);

  // Update ball trail and handle interpolation
  useEffect(() => {
    if (gameState?.ball) {
      setBallTrail((prev) => {
        const newTrail = [
          ...prev,
          { x: gameState.ball.x, y: gameState.ball.y },
        ];
        return newTrail.slice(-10); // Keep only last 10 positions
      });

      // Store previous state for interpolation
      setPreviousState(gameState);
    }
  }, [gameState?.ball]);

  // Interpolation effect for smooth rendering
  useEffect(() => {
    if (!previousState || !gameState) return;

    const interpolate = () => {
      const now = Date.now();
      const timeDiff = gameState.timestamp ? now - gameState.timestamp : 0;
      const interpolationFactor = Math.min(timeDiff / (1000 / 60), 1); // Max 1 frame ahead

      const interpolatedBall = {
        x:
          previousState.ball.x +
          (gameState.ball.x - previousState.ball.x) * interpolationFactor,
        y:
          previousState.ball.y +
          (gameState.ball.y - previousState.ball.y) * interpolationFactor,
      };

      const interpolatedPaddles = {
        player1:
          previousState.paddles.player1 +
          (gameState.paddles.player1 - previousState.paddles.player1) *
            interpolationFactor,
        player2:
          previousState.paddles.player2 +
          (gameState.paddles.player2 - previousState.paddles.player2) *
            interpolationFactor,
      };

      setInterpolatedState({
        ball: interpolatedBall,
        paddles: interpolatedPaddles,
      });
    };

    const interpolationFrame = requestAnimationFrame(interpolate);
    return () => cancelAnimationFrame(interpolationFrame);
  }, [gameState, previousState]);

  // Ball movement logic - removed since physics is handled server-side

  if (gameState.winner) {
    const winnerPlayer = gameState.players.find(
      (p) => p.id === gameState.winner
    );
    return (
      <div className="min-auto" style={{ backgroundColor: "#1E1B1E" }}>
        <div
          className="text-white flex items-center justify-center animate-pulse"
          style={{ backgroundColor: "#1E1B1E" }}
        >
          <div
            className="p-8 rounded-lg shadow-lg text-center"
            style={{ backgroundColor: "#2A252A" }}
          >
            <h2 className="text-3xl font-bold mb-4">¡Juego Terminado!</h2>
            <p className="text-lg mb-2">
              Ganador: {winnerPlayer?.name || gameState.winner}
            </p>
            <p className="text-lg mb-6">
              Puntaje Final: {gameState.scores.player1} -{" "}
              {gameState.scores.player2}
            </p>
            <div className="space-y-3">
              {onBackToLobby && isHost && (
                <button
                  onClick={onBackToLobby}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition duration-200 font-semibold"
                >
                  Seleccionar Nuevos Oponentes
                </button>
              )}
              <button
                onClick={onBackToLobby || (() => window.location.reload())}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md transition duration-200 font-semibold"
              >
                Volver a la Sala
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-auto text-white flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: "#1E1B1E" }}
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border-2 border-white bg-black transition-transform duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/30"
      />
      <div className="mt-4 text-center">
        <p className="text-gray-300 text-sm">
          Usa las teclas ↑↓ para mover tu paleta
        </p>
      </div>
    </div>
  );
}

export default Game;
