import React, { useState, useEffect } from "react";
import { socket, getCurrentSocket } from "../socket";

interface Player {
  id: string;
  name: string;
  room: string;
  isHost: boolean;
  isActive: boolean;
}

interface RoomData {
  name: string;
  players: Player[];
  guests: Player[];
  gameState: any;
  isGameActive: boolean;
  selectedPlayers: string[];
}

interface RoomLobbyProps {
  roomData: RoomData;
  isHost: boolean;
  onStartGame: (selectedPlayers: string[]) => void;
  onExitRoom: () => void;
}

function RoomLobby({
  roomData,
  isHost,
  onStartGame,
  onExitRoom,
}: Readonly<RoomLobbyProps>) {
  const [selectedPlayers, setSelectedPlayers] = useState(
    roomData.selectedPlayers || []
  );

  useEffect(() => {
    setSelectedPlayers(roomData.selectedPlayers || []);
  }, [roomData.selectedPlayers, isHost, roomData.players, roomData.guests]);

  const handlePlayerSelect = (playerId: string) => {
    if (!isHost) return;
    const current = selectedPlayers;
    let newSelected;
    if (current.includes(playerId)) {
      newSelected = current.filter((id) => id !== playerId);
    } else if (current.length < 2) {
      newSelected = [...current, playerId];
    } else {
      newSelected = current;
    }
    setSelectedPlayers(newSelected);
    const currentSocket = getCurrentSocket();
    if (currentSocket) {
      currentSocket.emit("update-selected-players", {
        selectedPlayers: newSelected,
      });
    }
  };

  const [isStartingGame, setIsStartingGame] = useState(false);

  const handleStartGame = () => {
    if (selectedPlayers.length === 2 && isHost && !isStartingGame) {
      setIsStartingGame(true);
      console.log("Starting game...");
      onStartGame(selectedPlayers);

      // Reset starting state after 3 seconds (in case no response)
      setTimeout(() => {
        setIsStartingGame(false);
      }, 3000);
    }
  };

  // Combine players and guests for selection
  const allPlayers = [...roomData.players, ...roomData.guests];

  return (
    <div className="min-auto" style={{ backgroundColor: "#1E1B1E" }}>
      <div
        className="text-white flex items-center justify-center font-roboto"
        style={{ backgroundColor: "#1E1B1E" }}
      >
        <div
          className="p-8 rounded-lg shadow-lg w-full max-w-md"
          style={{ backgroundColor: "#2A252A" }}
        >
          <h2 className="text-2xl font-bold mb-6 text-center">
            Sala de Espera {isHost && "(Anfitrión)"}
          </h2>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-cyan-400">
              Jugadores Esperando ({allPlayers.length})
            </h3>
            <div
              className={`space-y-3 ${
                allPlayers.length > 5 ? "max-h-64 overflow-y-auto" : ""
              }`}
            >
              {allPlayers.map((player) => {
                const isSelected = selectedPlayers.includes(player.id);
                const isFirst = selectedPlayers[0] === player.id;
                let selectedClass = "";
                if (isSelected) {
                  if (isFirst) {
                    selectedClass =
                      "bg-pink-500/70 backdrop-blur-sm border-pink-500 ring-4 ring-pink-500/50 shadow-lg shadow-pink-500/50";
                  } else {
                    selectedClass =
                      "bg-blue-500/70 backdrop-blur-sm border-blue-500 ring-4 ring-blue-500/50 shadow-lg shadow-blue-500/50";
                  }
                }

                return (
                  <button
                    key={player.id}
                    type="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`bg-gray-700 p-3 rounded-lg border border-gray-600 transition-all duration-300 ${selectedClass} ${
                      isHost ? "cursor-pointer hover:bg-gray-600" : ""
                    } w-full text-left`}
                    onClick={
                      isHost ? () => handlePlayerSelect(player.id) : undefined
                    }
                    onKeyDown={
                      isHost
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handlePlayerSelect(player.id);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            player.isActive ? "bg-green-400" : "bg-gray-500"
                          }`}
                        ></div>
                        <span className="font-medium">{player.name}</span>
                        {player.isHost && (
                          <span className="text-xs bg-cyan-600 text-white px-2 py-1 rounded">
                            Anfitrión
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-center space-y-4">
            {isHost && (
              <>
                <p className="mb-4">
                  Jugadores seleccionados: {selectedPlayers.length}/2
                </p>
                <button
                  onClick={handleStartGame}
                  disabled={selectedPlayers.length !== 2 || isStartingGame}
                  className={`w-full py-2 px-4 rounded-md transition duration-200 font-semibold ${
                    selectedPlayers.length === 2 && !isStartingGame
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : isStartingGame
                      ? "bg-yellow-600 text-white"
                      : "bg-gray-600 cursor-not-allowed text-gray-300"
                  }`}
                  style={{
                    pointerEvents:
                      selectedPlayers.length === 2 && !isStartingGame
                        ? "auto"
                        : "none",
                    opacity:
                      selectedPlayers.length === 2 && !isStartingGame ? 1 : 0.5,
                    position: "relative",
                    zIndex: 10,
                  }}
                >
                  {isStartingGame
                    ? "Iniciando..."
                    : `Iniciar Juego${
                        selectedPlayers.length !== 2
                          ? ` (${selectedPlayers.length}/2)`
                          : ""
                      }`}
                </button>
              </>
            )}
            <button
              onClick={onExitRoom}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md transition duration-200 font-semibold"
            >
              {isHost ? "Eliminar Sala" : "Salir de la Sala"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomLobby;
