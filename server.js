const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const users = new Map(); // Store connected users by userId
const rooms = new Map(); // Store active rooms

// Socket.IO event handling
io.on('connection', (socket) => {
  let userId = null;

  console.log('User connected:', socket.id);

  // Event fired when a new user identifies themselves
  socket.on('identify', (data) => {
    const {
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege
    } = data;

    userId = userEmail;

    // Store user details in users Map
    users.set(userId, {
      socket,
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege,
      isPaired: false,
      room: null,
    });

    // Pair users based on preferences
    pairUsers(userId);
  });

  // Event fired when a user sends a message
  socket.on('message', (data) => {
    const parsedMessage = JSON.parse(data);

    // Handle message event and broadcast to the room
    if (parsedMessage.type === 'message' && userId && users.has(userId)) {
      const {
        content
      } = parsedMessage;
      const {
        room
      } = users.get(userId);
      sendMessageToRoom(room, userId, content);
    }

    // Handle other message types (typing, stopped typing, etc.) if needed
  });

  // Event fired when a user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (userId && users.has(userId)) {
      const {
        room,
        isPaired
      } = users.get(userId);
      users.delete(userId);

      // Clean up rooms and notify paired user on disconnect
      if (isPaired && room && rooms.has(room)) {
        const pairedUserId = getPairedUserId(room, userId);

        if (pairedUserId && users.has(pairedUserId)) {
          const pairedUser = users.get(pairedUserId);
          pairedUser.socket.emit('pairDisconnected');
          users.delete(pairedUserId);
        }

        rooms.delete(room);
      }
    }
  });
});

// Function to pair users based on preferences
function pairUsers(userId) {
  const user = users.get(userId);

  for (const [otherUserId, otherUser] of users.entries()) {
    if (otherUserId !== userId && !otherUser.isPaired) {
      if (canPair(user, otherUser)) {
        const roomId = uuidv4();

        // Pair the users and create a room
        user.isPaired = true;
        user.room = roomId; 
        otherUser.isPaired = true;
        otherUser.room = roomId;

        rooms.set(roomId, [userId, otherUserId]);

        // Notify users about successful pairing
        user.socket.emit('pairingSuccess', {
          roomId,
          strangerGender: otherUser.userGender
        });
        otherUser.socket.emit('pairingSuccess', {
          roomId,
          strangerGender: user.userGender
        });

        break;
      }
    }
  }
}

// Function to check if users can be paired based on preferences
function canPair(userA, userB) {
  return (
    !userA.isPaired &&
    !userB.isPaired &&
    (userA.preferredGender === 'any' || userA.preferredGender === userB.userGender) &&
    (userB.preferredGender === 'any' || userB.preferredGender === userA.userGender) &&
    (userA.preferredCollege === 'any' || userA.preferredCollege === userB.userCollege) &&
    (userB.preferredCollege === 'any' || userB.preferredCollege === userA.userCollege)
  );
}

// Function to broadcast message to users in a room
function sendMessageToRoom(roomId, senderUserId, content) {
  if (rooms.has(roomId)) {
    const pair = rooms.get(roomId);
    pair.forEach((userId) => {
      if (userId !== senderUserId && users.has(userId)) {
        users.get(userId).socket.emit('message', {
          content
        });
      }
    });
  }
}

// Function to get the paired user ID in a room
function getPairedUserId(roomId, userId) {
  if (rooms.has(roomId)) {
    const pair = rooms.get(roomId);
    return pair.find((id) => id !== userId && users.has(id));
  }
  return null;
}

// Server listening on port 8080
server.listen(8080, () => {
  console.log('Server started on port 8080');
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
