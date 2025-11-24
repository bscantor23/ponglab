import io, { Socket } from "socket.io-client";

const DOMAIN = import.meta.env.VITE_DOMAIN;

const SERVERS = [
  `${DOMAIN}:${import.meta.env.VITE_SERVER_PORT || "3001"}`,
  `${DOMAIN}:${import.meta.env.VITE_BACKUP_SERVER_PORT || "3002"}`,
];

let currentSocket: Socket | null = null;
let currentServerIndex = 0;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 2000; // 2 seconds

// Track socket by player name to avoid conflicts
let currentPlayerName: string | null = null;

// Player-specific socket management to prevent conflicts
const playerSockets = new Map<string, Socket>();

// Get socket for specific player name
const getPlayerSocket = (playerName: string): Socket | null => {
  return playerSockets.get(playerName) || null;
};

// Set socket for specific player name
const setPlayerSocket = (playerName: string, socket: Socket) => {
  playerSockets.set(playerName, socket);
  currentPlayerName = playerName;
  currentSocket = socket;
};

// Remove socket for player name
const removePlayerSocket = (playerName: string) => {
  playerSockets.delete(playerName);
  if (currentPlayerName === playerName) {
    currentPlayerName = null;
    currentSocket = null;
  }
};

// Store current room information for automatic rejoin
interface StoredRoomInfo {
  roomName: string;
  password: string;
  playerName: string;
}

// Get stored room info from localStorage
const getStoredRoomInfo = (): StoredRoomInfo | null => {
  try {
    const stored = localStorage.getItem("pong-room-info");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// Get current player name from stored room info
const getCurrentPlayerName = (): string | null => {
  const roomInfo = getStoredRoomInfo();
  return roomInfo?.playerName || null;
};

// Store room info in localStorage
const storeRoomInfo = (roomInfo: StoredRoomInfo) => {
  try {
    localStorage.setItem("pong-room-info", JSON.stringify(roomInfo));
  } catch (error) {
    console.warn("Failed to store room info:", error);
  }
};

// Clear stored room info
const clearStoredRoomInfo = () => {
  try {
    localStorage.removeItem("pong-room-info");
  } catch (error) {
    console.warn("Failed to clear room info:", error);
  }
};

// Try to connect to the next server in the list
const tryNextServer = async (): Promise<Socket | null> => {
  if (currentServerIndex >= SERVERS.length) {
    console.error("All servers are unavailable");
    return null;
  }

  const serverUrl = SERVERS[currentServerIndex];
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, {
      timeout: 5000,
      reconnection: false, // We handle reconnection manually
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Connection timeout"));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      currentServerIndex = 0; // Reset for future connections
      reconnectAttempts = 0;
      resolve(socket);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeout);

      // Try next server
      currentServerIndex++;
      if (currentServerIndex < SERVERS.length) {
        setTimeout(() => {
          tryNextServer().then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(new Error("All servers failed"));
      }
    });
  });
};

// Try to connect to Server A first (for room creation priority)
const tryServerAFirst = async (): Promise<Socket | null> => {
  const serverAUrl = SERVERS[0]; // Always try Server A first

  return new Promise((resolve, reject) => {
    const socket = io(serverAUrl, {
      timeout: 5000,
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Server A connection timeout"));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      // Try Server B as fallback
      const serverBUrl = SERVERS[1];

      const fallbackSocket = io(serverBUrl, {
        timeout: 5000,
        reconnection: false,
      });

      const fallbackTimeout = setTimeout(() => {
        fallbackSocket.disconnect();
        reject(new Error("Both Server A and Server B failed"));
      }, 5000);

      fallbackSocket.on("connect", () => {
        clearTimeout(fallbackTimeout);
        resolve(fallbackSocket);
      });

      fallbackSocket.on("connect_error", (fallbackError) => {
        clearTimeout(fallbackTimeout);
        reject(new Error("Both Server A and Server B failed"));
      });
    });
  });
};

// Handle socket disconnection and auto-reconnect
const handleDisconnection = async () => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    return;
  }

  reconnectAttempts++;

  // Get player name from stored info to ensure we have the right player
  const playerName = getCurrentPlayerName();

  if (!playerName) {
    return;
  }

  try {
    const newSocket = await tryNextServer();

    if (newSocket) {
      currentSocket = newSocket;

      // Also update the backward compatibility socket variable
      socket = newSocket;

      setPlayerSocket(playerName, newSocket);

      setupSocketEvents(newSocket);

      // Rejoin room if we have stored room info
      const roomInfo = getStoredRoomInfo();
      if (roomInfo) {
        setTimeout(() => {
          newSocket.emit("join-room", roomInfo);
        }, 1000);
      }
    } else {
      console.error("Failed to obtain new socket during reconnection");
    }
  } catch (error) {
    console.error("Failed to reconnect:", error);
    setTimeout(() => {
      handleDisconnection();
    }, reconnectDelay);
  }
};

// Setup event listeners for the socket
const setupSocketEvents = (socket: Socket) => {
  // Store original disconnect handler
  const originalDisconnect = () => {
    handleDisconnection();
  };

  socket.on("disconnect", originalDisconnect);

  // Store room info when successfully joining a room
  socket.on("room-joined", (data) => {
    if (data.success) {
      const roomInfo = getStoredRoomInfo();
      if (roomInfo) {
        storeRoomInfo(roomInfo);
      }
    }
  });

  // Clear stored room info when leaving room
  socket.on("room-deleted", () => {
    clearStoredRoomInfo();
  });

  // Handle other socket events normally
  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
  });
};

// Main connection function
export const connectToServers = async (): Promise<Socket> => {
  try {
    const socket = await tryNextServer();
    if (!socket) {
      throw new Error("Failed to connect to any server");
    }

    currentSocket = socket;
    setupSocketEvents(socket);

    return socket;
  } catch (error) {
    console.error("Failed to establish connection:", error);
    throw error;
  }
};

// Create room with Server A priority
export const createRoomWithPriority = async (
  roomName: string,
  password: string,
  playerName: string
): Promise<Socket> => {
  try {
    // Always try Server A first for room creation
    const socket = await tryServerAFirst();

    if (!socket) {
      throw new Error("Failed to connect to any server for room creation");
    }

    // Set up player-specific socket management
    setPlayerSocket(playerName, socket);
    setupSocketEvents(socket);

    // Store room info
    const roomInfo = { roomName, password, playerName };
    storeRoomInfo(roomInfo);

    socket.emit("join-room", roomInfo);

    return socket;
  } catch (error) {
    console.error("Failed to create room with Server A priority:", error);
    throw error;
  }
};

// Join room function with automatic storage
export const joinRoom = (
  socket: Socket,
  roomName: string,
  password: string,
  playerName: string
) => {
  const roomInfo = { roomName, password, playerName };
  storeRoomInfo(roomInfo);

  // Set up player-specific socket management
  setPlayerSocket(playerName, socket);

  // Check for socket conflicts
  const existingSocket = getPlayerSocket(playerName);
  if (existingSocket && existingSocket.id !== socket.id) {
    console.error(`WARNING: Player ${playerName} has multiple sockets!`, {
      old: existingSocket.id,
      new: socket.id,
    });
  }

  socket.emit("join-room", roomInfo);
};

// Leave room function with storage cleanup
export const leaveRoom = (socket: Socket) => {
  // Find which player this socket belongs to
  let playerNameToRemove: string | null = null;
  playerSockets.forEach((playerSocket, name) => {
    if (playerSocket.id === socket.id) {
      playerNameToRemove = name;
    }
  });

  if (playerNameToRemove) {
    removePlayerSocket(playerNameToRemove);
  }

  socket.emit("leave-room");
  clearStoredRoomInfo();
};

// Get the current socket instance
export const getCurrentSocket = (): Socket | null => {
  const socket = currentSocket;
  if (socket) {
    console.log("getCurrentSocket returning:", {
      socketId: socket.id,
      playerName: currentPlayerName,
    });
    console.log("All active player sockets:");
    playerSockets.forEach((playerSocket, name) => {
      console.log(`  ${name}: ${playerSocket.id}`);
    });
  } else {
    console.log(
      "getCurrentSocket returning null, playerName:",
      currentPlayerName
    );
    console.log("All active player sockets:");
    playerSockets.forEach((playerSocket, name) => {
      console.log(`  ${name}: ${playerSocket.id}`);
    });
  }
  return socket;
};

// Export the socket for backward compatibility
export let socket: Socket | null = null;

// Initialize connection
connectToServers()
  .then((connectedSocket) => {
    socket = connectedSocket;
    console.log("Multi-server connection established");
  })
  .catch((error) => {
    console.error("Failed to establish multi-server connection:", error);
  });
