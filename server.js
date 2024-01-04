const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
app.use(cors({
  origin: '*', // Allow requests from all origins
  methods: ['GET', 'POST'],
}));
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
    console.log(data)

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

// findnew event__________________________________
socket.on('findNewPair', (data) => {
  if (userId && users.has(userId)) {
    console.log(userId, 'userId')
    const {
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege
    } = data;
    console.log('got data as:', userEmail, userGender, userCollege, preferredGender, preferredCollege)

    // Update the user's preferences in the users Map
    const user = users.get(userId);
    user.userEmail = userEmail;
    user.userGender = userGender;
    user.userCollege = userCollege;
    user.preferredGender = preferredGender;
    user.preferredCollege = preferredCollege;

    const {
      room,
      isPaired
    } = user;

    // Disconnect the current room and inform the other user about the disconnection
    if (isPaired && room && rooms.has(room)) {
      const pairedUserId = getPairedUserId(room, userId);

      if (pairedUserId && users.has(pairedUserId)) {
        const pairedUser = users.get(pairedUserId);
        pairedUser.socket.emit('pairDisconnected');
        rooms.delete(room);
      }

      rooms.delete(room);
      user.isPaired = false;
      user.room = null;
    }

    // Pair the user again based on the updated preferences
    pairUsers(userId);
  }
});



    // console.log('users:',users)
    console.log('users map length is:', users.size)
    // Pair users based on preferences
    pairUsers(userId);
  });

// Event fired when a user sends a message
socket.on('message', (data) => {
  const { type, content } = data;

  if (type === 'message' && userId && users.has(userId)) {
    const { room } = users.get(userId);
    sendMessageToRoom(room, userId, content);
  }
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

  let bestMatch = null;
  let maxScore = -1;

  for (const otherUser of users.values()) {
    if (
      !otherUser.isPaired &&
      otherUser.userEmail !== userId &&
      (
        otherUser.preferredGender === user.userGender ||
        otherUser.preferredGender === 'any' ||
        user.preferredGender === 'any'
      ) &&
      (
        otherUser.preferredCollege === user.preferredCollege ||
        otherUser.preferredCollege === 'any' ||
        user.preferredCollege === 'any'
      )
    ) {
      const score = (
        (otherUser.preferredGender === user.userGender ? 1 : 0) +
        (otherUser.preferredCollege === user.preferredCollege ? 1 : 0)
      );

      if (score > maxScore) {
        maxScore = score;
        bestMatch = otherUser;
      }
    }
  }

  if (bestMatch) {
    const roomId = uuidv4();

    // Pair the users and create a room
    user.isPaired = true;
    user.room = roomId;
    bestMatch.isPaired = true;
    bestMatch.room = roomId;

    rooms.set(roomId, [userId, bestMatch.userEmail]);

    // Notify users about successful pairing
    if (bestMatch.userGender !== user.preferredGender) {
      user.socket.emit('pairedWithDifferentGender', {
        message: "You've been matched! While we respect your preferences, sometimes the best conversations come from unexpected connections. Enjoy the chat!",
      });
      bestMatch.socket.emit('pairedWithDifferentGender', {
        message: "You've been matched! While we respect your preferences, sometimes the best conversations come from unexpected connections. Enjoy the chat!",
      });
    } else {
      user.socket.emit('pairingSuccess', {
        roomId,
        strangerGender: bestMatch.userGender,
        stranger: bestMatch.userEmail,
      });
      bestMatch.socket.emit('pairingSuccess', {
        roomId,
        strangerGender: user.userGender,
      });
    }
  }
} 



// Function to broadcast message to users in a room
function sendMessageToRoom(roomId, senderUserId, content) {
  if (rooms.has(roomId)) {
    const pair = rooms.get(roomId);
    pair.forEach((userId) => {
      if (userId !== senderUserId && users.has(userId)) {
        const receiverSocket = users.get(userId).socket;
        receiverSocket.emit('message', { type: 'message', sender: senderUserId, content });
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
// Server listening on port 3001
server.listen(3001, () => {
  console.log('Server started on port 3001');
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
