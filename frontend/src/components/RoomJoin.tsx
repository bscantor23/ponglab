import React, { useState, useEffect } from "react";
import { socket } from "../socket";

interface Room {
  name: string;
  hostId: string;
  players: any[];
  guests: any[];
  gameState: any;
  isGameActive: boolean;
}

interface RoomJoinProps {
  readonly onJoin: (
    roomName: string,
    password: string,
    playerName: string
  ) => void;
}

function RoomJoin({ onJoin }: RoomJoinProps) {
  const [roomName, setRoomName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);

  useEffect(() => {
    // Request available rooms from server
    socket.emit("get-rooms");

    socket.on("rooms-list", (rooms: Room[]) => {
      setAvailableRooms(rooms);
    });

    // Set up periodic refresh every 5 seconds
    const interval = setInterval(() => {
      socket.emit("get-rooms");
    }, 5000);

    return () => {
      socket.off("rooms-list");
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomName && playerName) {
      onJoin(roomName, password, playerName);
    }
  };

  const handleJoinExistingRoom = (room: Room) => {
    setRoomName(room.name);
  };

  return (
    <div className="min-auto" style={{ backgroundColor: "#1E1B1E" }}>
      <div
        className=" text-white flex items-center justify-center font-roboto"
        style={{ backgroundColor: "#1E1B1E" }}
      >
        <div
          className="p-8 rounded-lg shadow-lg w-full max-w-md"
          style={{ backgroundColor: "#2A252A" }}
        >
          <h2 className="text-2xl font-bold mb-6 text-center">
            Unirse o Crear Sala
          </h2>

          {availableRooms.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-cyan-400">
                Salas Disponibles
              </h3>
              <div
                className={`grid gap-3 ${
                  availableRooms.length > 1 ? "max-h-30 overflow-y-auto" : ""
                }`}
              >
                {availableRooms.map((room) => (
                  <div
                    key={room.name}
                    className="bg-gray-700 p-4 rounded-lg border border-gray-600 hover:border-cyan-400 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/20"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-white">{room.name}</h4>
                      <span className="text-sm text-gray-300 bg-gray-600 px-2 py-1 rounded">
                        {room.players.length + room.guests.length} players
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">
                        Status: {room.isGameActive ? "In Game" : "Waiting"}
                      </span>
                      <button
                        onClick={() => handleJoinExistingRoom(room)}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white py-1 px-3 rounded text-sm transition duration-200 font-medium"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="room-name-input"
                className="block text-sm font-medium mb-1"
              >
                Nombre de la Sala:
              </label>
              <input
                id="room-name-input"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="password-input"
                className="block text-sm font-medium mb-1"
              >
                Contraseña (opcional):
              </label>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="player-name-input"
                className="block text-sm font-medium mb-1"
              >
                Tu Nombre:
              </label>
              <input
                id="player-name-input"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md transition duration-200 font-semibold"
            >
              Unirse a la Sala
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RoomJoin;
