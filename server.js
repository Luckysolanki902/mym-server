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


// number of users online rounded off
let roundedUsers = 0;

// Function to calculate and update rounded user count
function updateRoundedUsersCount() {
  let newRoundedUsers = users.size;

  // Round to the nearest power of 10 based on specific thresholds
  if (newRoundedUsers >= 5 && newRoundedUsers < 10) {
    newRoundedUsers = 10;
  } else if (newRoundedUsers >= 10 && newRoundedUsers < 20) {
    newRoundedUsers = 20;
  } else {
    newRoundedUsers = Math.pow(10, Math.ceil(Math.log10(newRoundedUsers)));
  }

  // Emit the updated rounded user count if it changes
  if (newRoundedUsers !== roundedUsers) {
    roundedUsers = newRoundedUsers;
    io.emit('roundedUsersCount', roundedUsers);
  }
}


// Socket.IO event handling
io.on('connection', (socket) => {
  let userId = null;

  console.log('A User connected:');

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


    // Event fired when a user starts typing
    socket.on('typing', () => {
      if (userId && users.has(userId)) {
        const { room } = users.get(userId);
        if (rooms.has(room)) {
          const pair = rooms.get(roomId);
          pair.forEach((userId) => {
            if (userId !== userId && users.has(userId)) {
              const receiverSocket = users.get(userId).socket;
              receiverSocket.emit('userTyping', userId);
            }
          });
        }
      }
    });
    // Event fired when a user stops typing
    socket.on('stoppedTyping', () => {
      if (userId && users.has(userId)) {
        const { room } = users.get(userId);
        if (rooms.has(room)) {
          const pair = rooms.get(roomId);
          pair.forEach((userId) => {
            if (userId !== userId && users.has(userId)) {
              const receiverSocket = users.get(userId).socket;
              receiverSocket.emit('userStoppedTyping', userId);
            }
          });
        }
      }
    });


    // findnew event__________________________________
    socket.on('findNewPair', (data) => {
      if (userId && users.has(userId)) {
        const {
          userEmail,
          userGender,
          userCollege,
          preferredGender,
          preferredCollege
        } = data;

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
        // Update the rounded user count
        updateRoundedUsersCount();

        // Pair the user again based on the updated preferences
        pairUsers(userId);
      }
    });



    console.log('users online are:', users.size)
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
    console.log('1 User disconnected:');
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
    console.log('Made a pair')
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
server.listen(1000, () => {
  console.log('Server started');
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
