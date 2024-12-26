const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');
const PairingManager = require('./utils/pairingManger');

const app = express();
const server = http.createServer(app);

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Create maps and queues for managing different page types
const textChatUsers = new Map();
const textChatQueue = [];
const textChatRooms = new Map();

const audioCallUsers = new Map();
const audioCallQueue = [];
const audioCallRooms = new Map();

const videoCallUsers = new Map();
const videoCallQueue = [];
const videoCallRooms = new Map();

// Create pairing managers for different page types
const textChatPairingManager = new PairingManager(io, textChatQueue, textChatUsers, textChatRooms);
const audioCallPairingManager = new PairingManager(io, audioCallQueue, audioCallUsers, audioCallRooms);
const videoCallPairingManager = new PairingManager(io, videoCallQueue, videoCallUsers, videoCallRooms);

// Handle socket connections
io.on('connection', (socket) => {
  const { pageType } = socket.handshake.query;

  if (!pageType) {
    console.error(`[${new Date().toISOString()}] Invalid connection attempt: missing pageType`);
    return;
  }

  console.info(`[${new Date().toISOString()}] Socket connected. PageType: ${pageType}, Socket ID: ${socket.id}`);

  try {
    if (pageType === 'textchat') {
      handleSocketEvents(io, socket, textChatUsers, textChatQueue, textChatRooms, textChatPairingManager);
    } else if (pageType === 'audiocall') {
      handleSocketEvents(io, socket, audioCallUsers, audioCallQueue, audioCallRooms, audioCallPairingManager);
    } else if (pageType === 'videocall') {
      handleSocketEvents(io, socket, videoCallUsers, videoCallQueue, videoCallRooms, videoCallPairingManager);
    } else {
      console.error(`[${new Date().toISOString()}] Invalid pageType: ${pageType}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error handling socket events: ${error.message}`);
  }

  socket.on('disconnect', () => {
    console.info(`[${new Date().toISOString()}] Socket disconnected. Socket ID: ${socket.id}`);
  });
});

// API endpoint to get user statistics
app.get('/api/user-stats', (req, res) => {
  try {
    const getUsersStats = (usersMap) => {
      let totalUsers = 0;
      let maleUsers = 0;
      let femaleUsers = 0;
      let collegeStats = {};

      for (let user of usersMap.values()) {
        totalUsers++;
        if (user.userGender === 'male') {
          maleUsers++;
        } else if (user.userGender === 'female') {
          femaleUsers++;
        }

        if (user.userCollege) {
          collegeStats[user.userCollege] = (collegeStats[user.userCollege] || 0) + 1;
        }
      }

      return { totalUsers, maleUsers, femaleUsers, collegeStats };
    };

    const textChatStats = getUsersStats(textChatUsers);
    const audioCallStats = getUsersStats(audioCallUsers);
    const videoCallStats = getUsersStats(videoCallUsers);

    res.json({
      textChatStats,
      audioCallStats,
      videoCallStats,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching user stats: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
server.listen(1000, () => {
  console.info(`[${new Date().toISOString()}] Server started on port 1000`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error(`[${new Date().toISOString()}] Unhandled Promise Rejection: ${error.message}`);
});
