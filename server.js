// Standalone Socket.IO Server for Lead City Multiplayer Game
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['https://luxeagent.netlify.app', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Lead City Socket.IO Server',
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const rooms = new Map();
const players = new Map();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create-room', ({ roomName, playerName }) => {
    const roomId = roomName || 'Geral';
    socket.rooms.forEach(room => { if (room !== socket.id) socket.leave(room); });
    socket.join(roomId);
    
    const player = {
      id: socket.id,
      name: playerName || `Player_${socket.id.substring(0, 4)}`,
      room: roomId,
      x: 100,
      y: 100,
      score: 0
    };
    
    players.set(socket.id, player);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { id: roomId, players: new Set([socket.id]), createdAt: Date.now() });
    } else {
      rooms.get(roomId).players.add(socket.id);
    }

    console.log(`Player ${player.name} joined room ${roomId}`);
    socket.emit('room-joined', { roomId, playerId: socket.id, player });
    
    const roomPlayers = Array.from(rooms.get(roomId).players).map(id => players.get(id)).filter(p => p);
    socket.emit('players-list', roomPlayers);
    socket.to(roomId).emit('player-joined', player);
  });

  socket.on('player-movement', (data) => {
    const player = players.get(socket.id);
    if (player && player.room) {
      player.x = data.x;
      player.y = data.y;
      if (data.animation) player.animation = data.animation;
      if (data.flipX !== undefined) player.flipX = data.flipX;
      socket.to(player.room).emit('player-moved', { playerId: socket.id, ...data });
    }
  });

  socket.on('collect-item', (data) => {
    const player = players.get(socket.id);
    if (player && player.room) {
      player.score += data.points || 0;
      io.to(player.room).emit('item-collected', {
        playerId: socket.id,
        itemId: data.itemId,
        points: data.points,
        playerScore: player.score
      });
    }
  });

  socket.on('chat-message', (message) => {
    const player = players.get(socket.id);
    if (player && player.room) {
      io.to(player.room).emit('chat-message', {
        playerId: socket.id,
        playerName: player.name,
        message,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.room) {
      const room = rooms.get(player.room);
      if (room) {
        room.players.delete(socket.id);
        if (room.players.size === 0) {
          rooms.delete(player.room);
        } else {
          socket.to(player.room).emit('player-left', { playerId: socket.id, playerName: player.name });
        }
      }
    }
    players.delete(socket.id);
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lead City Socket.IO Server running on port ${PORT}`);
});
