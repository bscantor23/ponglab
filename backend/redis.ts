import { createClient, RedisClientType } from "redis";

export const pub: RedisClientType = createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
});

export const sub: RedisClientType = pub.duplicate();

export const initializeRedis = async () => {
  try {
    await pub.connect();
    await sub.connect();
    console.log("Redis connected successfully");
  } catch (error) {
    console.error("Redis connection failed:", error);
    throw error;
  }
};

export const publishGameState = async (roomName: string, state: any) => {
  try {
    const message = JSON.stringify({
      roomName,
      state,
      timestamp: Date.now(),
      serverId: process.env.SERVER_ID || "default-server",
    });
    await pub.publish(`game-state:${roomName}`, message);
  } catch (error) {
    console.error("Failed to publish game state:", error);
  }
};

export const publishRoomMetadata = async (roomName: string, roomData: any) => {
  try {
    const serverId = process.env.SERVER_ID || "default-server";
    const message = JSON.stringify({
      roomName,
      roomData,
      timestamp: Date.now(),
      serverId,
      type: "room-metadata",
    });

    // Also store metadata for later retrieval
    const metadataKey = `room:${roomName}:metadata`;
    const metadataJson = JSON.stringify(roomData);

    console.log(
      `🔍 Publishing room metadata for room ${roomName} from server ${serverId}`
    );
    // Store metadata first (this is critical for room recovery)
    await pub.set(metadataKey, metadataJson);
    await pub.publish(`room-metadata:${roomName}`, message);

    // Verify storage by reading it back
    const storedData = await pub.get(metadataKey);
  } catch (error: any) {
    console.error("❌ Failed to publish room metadata:", error);
  }
};

export const subscribeToGameState = async (
  roomName: string,
  callback: (data: any) => void
) => {
  try {
    await sub.subscribe(`game-state:${roomName}`, (message: string) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        console.error("Failed to parse game state message:", error);
      }
    });
  } catch (error) {
    console.error("Failed to subscribe to game state:", error);
  }
};

export const subscribeToRoomMetadata = async (
  roomName: string,
  callback: (data: any) => void
) => {
  try {
    await sub.subscribe(`room-metadata:${roomName}`, (message: string) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        console.error("Failed to parse room metadata message:", error);
      }
    });
    console.log(
      `Successfully subscribed to room metadata for room ${roomName}`
    );
  } catch (error) {
    console.error("Failed to subscribe to room metadata:", error);
  }
};

export const unsubscribeFromGameState = async (roomName: string) => {
  try {
    await sub.unsubscribe(`game-state:${roomName}`);
  } catch (error) {
    console.error("Failed to unsubscribe from game state:", error);
  }
};

export const unsubscribeFromRoomMetadata = async (roomName: string) => {
  try {
    await sub.unsubscribe(`room-metadata:${roomName}`);
  } catch (error) {
    console.error("Failed to unsubscribe from room metadata:", error);
  }
};

// Function to get Redis client for direct operations
export const getRedisClient = (): RedisClientType | null => {
  try {
    return pub;
  } catch (error) {
    console.error("Failed to get Redis client:", error);
    return null;
  }
};

// Function to check if room metadata exists in Redis
export const checkRoomMetadataExists = async (
  roomName: string
): Promise<boolean> => {
  try {
    const metadataKey = `room:${roomName}:metadata`;
    const exists = await pub.exists(metadataKey);
    return exists === 1;
  } catch (error) {
    console.error("Error checking room metadata existence:", error);
    return false;
  }
};

// Function to get room metadata from Redis
export const getRoomMetadataFromRedis = async (
  roomName: string
): Promise<any> => {
  try {
    const metadataKey = `room:${roomName}:metadata`;
    const metadata = await pub.get(metadataKey);
    if (metadata) {
      const parsed = JSON.parse(metadata);
      return parsed;
    }
    return null;
  } catch (error) {
    console.error("Error getting room metadata:", error);
    return null;
  }
};

// Function to publish primary server election
export const publishPrimaryServerElection = async (serverId: string) => {
  try {
    const message = JSON.stringify({
      serverId,
      timestamp: Date.now(),
      type: "primary-election",
      status: "elected",
    });
    await pub.publish("primary-server-election", message);
  } catch (error) {
    console.error("Failed to publish primary server election:", error);
  }
};

// Enhanced function to get all active rooms from Redis with better debugging
export const getAllActiveRoomsFromRedis = async (): Promise<string[]> => {
  try {
    console.log(`🔍 Starting Redis room discovery...`);

    // Check Redis connection first
    const pingResult = await pub.ping();

    // Look for all room metadata keys
    const keys = await pub.keys("room:*:metadata");

    const rooms: string[] = [];

    for (const key of keys) {
      try {
        const roomName = key.replace("room:", "").replace(":metadata", "");

        // Verify each key actually has data
        const metadata = await pub.get(key);
        if (metadata) {
          const parsed = JSON.parse(metadata);
          rooms.push(roomName);
        }
      } catch (keyError) {
        console.error(`❌ Error processing key ${key}:`, keyError);
      }
    }

    return rooms;
  } catch (error: any) {
    console.error("❌ Error getting active rooms from Redis:", error);
    return [];
  }
};

// Add Redis health check function
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    await pub.ping();
    console.log(`✅ Redis health check passed`);
    return true;
  } catch (error) {
    console.error(`❌ Redis health check failed:`, error);
    return false;
  }
};

// Add function to debug all Redis keys
export const debugAllRedisKeys = async (): Promise<void> => {
  try {
    const metadataKeys = await pub.keys("room:*:metadata");

    // Check each metadata key
    for (const key of metadataKeys) {
      try {
        const data = await pub.get(key);
        if (data) {
          const parsed = JSON.parse(data);
        }
      } catch (error) {
        console.error(`Error reading ${key}:`, error);
      }
    }
  } catch (error) {
    console.error("Error debugging Redis keys:", error);
  }
};

// Graceful shutdown
export const closeRedis = async () => {
  try {
    await pub.quit();
    await sub.quit();
    console.log("Redis connections closed");
  } catch (error) {
    console.error("Error closing Redis connections:", error);
  }
};
