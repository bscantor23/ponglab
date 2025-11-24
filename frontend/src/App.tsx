import React, { useState, useEffect } from "react";
import RoomJoin from "./components/RoomJoin";
import RoomLobby from "./components/RoomLobby";
import Game from "./components/Game";
import { getCurrentSocket, joinRoom as socketJoinRoom } from "./socket";

interface RoomData {
  name: string;
  players: any[];
  guests: any[];
  gameState: any;
  isGameActive: boolean;
  selectedPlayers: string[];
}

interface GameState {
  players: any[];
  scores: { player1: number; player2: number };
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { player1: number; player2: number };
  winner: string | null;
}

function App() {
  const [currentView, setCurrentView] = useState<"join" | "lobby" | "game">(
    "join"
  );
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [availableRooms, setAvailableRooms] = useState<RoomData[]>([]);

  useEffect(() => {
    // Get the current socket instance
    const currentSocket = getCurrentSocket();
    if (currentSocket) {
      setSocket(currentSocket);
    }

    // Force a socket update after a short delay to ensure we don't miss it
    const initialSocketCheck = setTimeout(() => {
      const socketAfterDelay = getCurrentSocket();
      if (socketAfterDelay && !socket) {
        setSocket(socketAfterDelay);
      }
    }, 1000);

    return () => {
      clearTimeout(initialSocketCheck);
    };
  }, []);

  // Separate effect for socket event setup
  useEffect(() => {
    if (!socket) return;

    socket.on(
      "room-joined",
      (data: { success: boolean; isHost: boolean; message?: string }) => {
        if (data.success) {
          setIsHost(data.isHost);
          setCurrentView("lobby");
        } else {
          setErrorMessage(data.message || "Error desconocido");
        }
      }
    );

    socket.on("room-update", (data: RoomData) => {
      console.log("App room-update:", data);
      setRoomData(data);
    });

    socket.on("game-started", (data: GameState) => {
      console.log("Game started event received:", data);
      setGameState(data);
      setCurrentView("game");
    });

    socket.on("game-update", (data: GameState) => {
      setGameState(data);
    });

    socket.on("room-deleted", () => {
      console.log("Room deleted event received");
      setCurrentView("join");
      setRoomData(null);
      setGameState(null);
      setIsHost(false);
    });

    socket.on("error", (data: { message: string }) => {
      console.error("Socket error received:", data);
      setErrorMessage(data.message || "An error occurred");
    });

    socket.on("rooms-list", (rooms: RoomData[]) => {
      console.log("App received rooms list:", rooms);
      setAvailableRooms(rooms);
    });

    return () => {
      console.log("Cleaning up socket events for:", socket.id);
      socket.off("room-joined");
      socket.off("room-update");
      socket.off("game-started");
      socket.off("game-update");
      socket.off("room-deleted");
      socket.off("error");
      socket.off("rooms-list");
    };
  }, [socket]);

  // Poll for socket changes (simple approach for now)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSocket = getCurrentSocket();
      if (currentSocket && currentSocket !== socket) {
        console.log(
          "Socket changed, updating socket reference for:",
          currentSocket.id
        );
        setSocket(currentSocket);
      }

      // Also update if socket is null but getCurrentSocket returns a valid socket
      if (!socket && currentSocket) {
        console.log(
          "Found socket via polling, updating reference for:",
          currentSocket.id
        );
        setSocket(currentSocket);
      }
    }, 500); // Check more frequently

    return () => {
      clearInterval(interval);
    };
  }, [socket]);

  const joinRoom = (
    roomName: string,
    password: string,
    playerName: string
  ): void => {
    const currentSocket = getCurrentSocket();
    if (currentSocket) {
      socketJoinRoom(currentSocket, roomName, password, playerName);
    } else {
      console.error("No socket available for joinRoom");
    }
  };

  const startGame = (selectedPlayers: string[]): void => {
    // Always get the current socket from the global function
    const currentSocket = getCurrentSocket();

    if (currentSocket) {
      currentSocket.emit("start-game", selectedPlayers);
    }
  };

  const updateGame = (ball: any, paddles: any, scores: any): void => {
    const currentSocket = getCurrentSocket();
    if (currentSocket) {
      currentSocket.emit("game-update", { ball, paddles, scores });
    }
  };

  return (
    <div
      className={`min-h-screen text-white`}
      style={{ backgroundColor: "#1E1B1E" }}
    >
      <h1 className="text-4xl font-bold text-center py-8">PongLab</h1>
      {currentView != "game" && (
        <img
          src="/ping_pong.gif"
          alt="Ping Pong"
          className="block mx-auto my-10 w-60"
        />
      )}
      {currentView === "join" && <RoomJoin onJoin={joinRoom} />}
      {currentView === "lobby" && roomData && (
        <RoomLobby
          roomData={roomData}
          isHost={isHost}
          onStartGame={startGame}
          onExitRoom={() => {
            const currentSocket = getCurrentSocket();
            if (currentSocket) {
              currentSocket.emit("leave-room");
            }
            setCurrentView("join");
            setRoomData(null);
            setIsHost(false);
          }}
        />
      )}
      {currentView === "game" &&
        gameState &&
        (() => {
          const currentSocket = getCurrentSocket();
          return (
            currentSocket && (
              <Game
                gameState={gameState}
                onUpdate={updateGame}
                socketId={currentSocket.id}
                onBackToLobby={() => {
                  currentSocket.emit("back-to-lobby");
                  setCurrentView("lobby");
                }}
                isWinner={gameState.winner === currentSocket.id}
                isHost={isHost}
              />
            )
          );
        })()}

      {errorMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-red-600 text-white p-6 rounded-lg shadow-lg max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Error</h3>
            <p className="mb-4">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="bg-white text-red-600 px-4 py-2 rounded font-semibold hover:bg-gray-100"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
