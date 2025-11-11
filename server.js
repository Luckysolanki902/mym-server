const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');
const PairingManager = require('./utils/pairingManger');
const EnhancedPairingManager = require('./utils/EnhancedPairingManager');
const PairingLogger = require('./utils/PairingLogger');

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

// Create ENHANCED pairing managers for different page types
const textChatPairingManager = new EnhancedPairingManager(io, textChatUsers, textChatRooms, 'textchat');
const audioCallPairingManager = new EnhancedPairingManager(io, audioCallUsers, audioCallRooms, 'audiocall');
const videoCallPairingManager = new EnhancedPairingManager(io, videoCallUsers, videoCallRooms, 'videocall');

PairingLogger.pairing('All pairing managers initialized', {
  textChat: 'ready',
  audioCall: 'ready',
  videoCall: 'ready'
});

// Handle socket connections
io.on('connection', (socket) => {
  const { pageType } = socket.handshake.query;

  if (!pageType) {
    PairingLogger.error('Invalid connection attempt: missing pageType', { socketId: socket.id });
    return;
  }

  PairingLogger.socket('Socket connected', { pageType, socketId: socket.id });

  try {
    if (pageType === 'textchat') {
      handleSocketEvents(io, socket, textChatUsers, textChatQueue, textChatRooms, textChatPairingManager);
    } else if (pageType === 'audiocall') {
      handleSocketEvents(io, socket, audioCallUsers, audioCallQueue, audioCallRooms, audioCallPairingManager);
    } else if (pageType === 'videocall') {
      handleSocketEvents(io, socket, videoCallUsers, videoCallQueue, videoCallRooms, videoCallPairingManager);
    } else {
      PairingLogger.error('Invalid pageType', { pageType, socketId: socket.id });
    }
  } catch (error) {
    PairingLogger.error('Error handling socket events', error);
  }

  socket.on('disconnect', () => {
    PairingLogger.socket('Socket disconnected', { socketId: socket.id });
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
  PairingLogger.pairing('Server started on port 1000', { 
    port: 1000,
    timestamp: new Date().toISOString()
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  PairingLogger.error('Unhandled Promise Rejection', error);
});

// Log metrics every 30 seconds
setInterval(() => {
  PairingLogger.metrics('Server metrics', {
    textChat: textChatPairingManager.getMetrics(),
    audioCall: audioCallPairingManager.getMetrics(),
    videoCall: videoCallPairingManager.getMetrics()
  });
}, 30000);
