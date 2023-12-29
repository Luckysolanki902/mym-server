const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

// Store connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
  socket.on('user connected', ({ displayName }) => {
    console.log(`User connected: ${displayName}`);
    connectedUsers.set(socket.id, displayName);

    // Check if both users are connected
    if (connectedUsers.size === 2) {
      const usernames = Array.from(connectedUsers.values());
      console.log(`Users ${usernames[0]} and ${usernames[1]} got connected to each other.`);
    }
  });

  socket.on('sendMessage', ({ sender, receiver, message }) => {
    console.log(`Message from ${sender} to ${receiver}: ${message}`);
    
    // Get the socket ID of the recipient based on the displayName
    const recipientSocket = [...connectedUsers.entries()]
      .find(([socketId, displayName]) => displayName === receiver);
  
    // Get the sender's socket ID
    const senderSocketId = [...connectedUsers.entries()]
      .find(([socketId, displayName]) => displayName === sender);
  
    if (recipientSocket) {
      const [recipientSocketId] = recipientSocket;
      io.to(recipientSocketId).emit('receiveMessage', { sender, message });
    } else {
      console.log(`User ${receiver} is not connected.`);
      // Handle the case where the recipient is not connected
      // Perhaps emit an event or handle it accordingly
    }
  
    if (senderSocketId) {
      const [senderId] = senderSocketId;
      io.to(senderId).emit('receiveMessage', { sender, message });
    }
  });
  

  socket.on('disconnect', () => {
    if (connectedUsers.has(socket.id)) {
      const disconnectedUser = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      console.log(`User disconnected: ${disconnectedUser}`);
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
