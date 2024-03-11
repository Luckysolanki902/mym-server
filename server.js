const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');
const PairingManager = require('./utils/pairingManger');

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

server.listen(1000, () => {
  console.log('Server started');
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
