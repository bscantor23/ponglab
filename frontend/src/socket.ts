import io from "socket.io-client";

// Get configuration from environment variables
const DOMAIN = import.meta.env.DOMAIN || 'http://localhost';
const SERVER_PORT = import.meta.env.SERVER_PORT || '3001';

console.log(`Connecting from Client to ${DOMAIN}:${SERVER_PORT}`)

export const socket = io(`${DOMAIN}:${SERVER_PORT}`);