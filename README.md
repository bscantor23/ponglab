# Pong Lab - Distributed Systems Educational Project

A real-time multiplayer ping pong game built with React, Node.js, and Socket.IO to demonstrate distributed systems concepts, particularly message passing and real-time synchronization.

## Features

- **Real-time multiplayer gameplay** using WebSocket connections
- **Room-based architecture** with optional password protection
- **Host controls** for selecting players from guest list
- **Clean architecture** with separated models, services, and controllers
- **Smooth animations** including ball trails and paddle glow effects
- **First to 10 wins** scoring system with winner selection

## Distributed Systems Concepts Demonstrated

- **Message Passing**: Real-time communication between clients and server using Socket.IO
- **State Synchronization**: Game state is synchronized across all connected clients
- **Event-Driven Architecture**: Socket events drive game updates and room management
- **Scalable Room System**: Multiple independent game rooms can run simultaneously

## Architecture

### Backend (Node.js + Express + Socket.IO)
- **Models**: `Room.js`, `Player.js` - Data structures for game entities
- **Services**: `RoomService.js` - Business logic for room and player management
- **Controllers**: `RoomController.js` - Handles Socket.IO events and responses
- **Server**: `server.js` - Main server setup and routing

### Frontend (React)
- **Components**: `RoomJoin`, `RoomLobby`, `Game` - UI components for different game states
- **Real-time Updates**: Socket.IO client integration for live synchronization
- **Canvas-based Rendering**: HTML5 Canvas for smooth game graphics

## Getting Started

1. **Install dependencies:**
   ```bash
   # Backend
   cd pong-lab/backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Start the servers:**
   ```bash
   # Backend (Terminal 1)
   cd pong-lab/backend
   npm start

   # Frontend (Terminal 2)
   cd pong-lab/frontend
   npm start
   ```

3. **Open your browser** to `http://localhost:3000` (frontend will redirect to correct port)

## How to Play

1. **Join/Create Room**: Enter a room name, optional password, and your player name
2. **Wait in Lobby**: As host, wait for guests to join
3. **Select Players**: Host selects exactly 2 players from the guest list
4. **Start Game**: Click "Start Game" to begin
5. **Play**: Use ↑↓ arrow keys to move your paddle
6. **Win**: First player to reach 10 points wins
7. **Continue**: Winner can select new players for another round

## Project Structure

```
pong-lab/
├── backend/
│   ├── models/
│   │   ├── Room.js
│   │   └── Player.js
│   ├── services/
│   │   └── RoomService.js
│   ├── controllers/
│   │   └── RoomController.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RoomJoin.js
│   │   │   ├── RoomLobby.js
│   │   │   └── Game.js
│   │   ├── App.js
│   │   └── App.css
│   └── package.json
└── README.md
```

## Technologies Used

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: React, HTML5 Canvas, CSS3 Animations
- **Real-time Communication**: Socket.IO
- **Architecture**: Clean Architecture pattern

## Educational Value

This project serves as a practical example for learning:
- Distributed systems fundamentals
- Real-time web application development
- WebSocket programming
- Clean code architecture
- React state management
- Game development concepts

## Future Enhancements

- User authentication and persistent sessions
- Tournament mode with brackets
- Power-ups and special abilities
- Spectator mode
- Mobile-responsive design
- Advanced game physics