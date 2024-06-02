const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');
const PairingManager = require('./utils/pairingManager');

const app = express();
const server = http.createServer(app);

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

// Things for text chat pageType
const textChatUsers = new Map();
const textChatQueue = [];
const textChatRooms = new Map();

// Things for audio call pageType
const audioCallUsers = new Map();
const audioCallQueue = [];
const audioCallRooms = new Map();

// Things for video call pageType
const videoCallUsers = new Map();
const videoCallQueue = [];
const videoCallRooms = new Map();

// Create pairing managers for different page types
const textChatPairingManager = new PairingManager(io, textChatQueue, textChatUsers, textChatRooms);
const audioCallPairingManager = new PairingManager(io, audioCallQueue, audioCallUsers, audioCallRooms);
const videoCallPairingManager = new PairingManager(io, videoCallQueue, videoCallUsers, videoCallRooms);

io.on('connection', (socket) => {
  const { pageType } = socket.handshake.query;
  if (pageType === 'textchat') {
    handleSocketEvents(io, socket, textChatUsers, textChatQueue, textChatRooms, textChatPairingManager);
  } else if (pageType === 'audiocall') {
    handleSocketEvents(io, socket, audioCallUsers, audioCallQueue, audioCallRooms, audioCallPairingManager);
  } else if (pageType === 'videocall') {
    handleSocketEvents(io, socket, videoCallUsers, videoCallQueue, videoCallRooms, videoCallPairingManager);
  } else {
    console.error('Invalid pageType:', pageType);
  }
});

// API endpoint to get user statistics
app.get('/api/user-stats', (req, res) => {
  try {
    const getUsersStats = (usersMap) => {
      let totalUsers = 0;
      let maleUsers = 0;
      let femaleUsers = 0;

      for (let user of usersMap.values()) {
        totalUsers++;
        if (user.userGender === 'male') {
          maleUsers++;
        } else if (user.userGender === 'female') {
          femaleUsers++;
        }
      }

      return { totalUsers, maleUsers, femaleUsers };
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
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

server.listen(1000, () => {
  console.log('Server started on port 1000');
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
