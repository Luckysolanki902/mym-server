const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');

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


// Function to shuffle the queue for each pageType
function shuffleQueue(userQueue) {
  for (let i = userQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [userQueue[i], userQueue[j]] = [userQueue[j], userQueue[i]];
  }
}

// Call the shuffleQueue function every minute for each pageType
setInterval(() => {
  console.log('Shuffling queues...');
  shuffleQueue(textChatQueue);
  shuffleQueue(audioCallQueue);
  shuffleQueue(videoCallQueue);
}, 60000 * 10); // 60000 milliseconds = 1 minute


io.on('connection', (socket) => {
  const { pageType } = socket.handshake.query;
  if (pageType === 'textchat') {
    handleSocketEvents(io, socket, textChatUsers, textChatQueue, textChatRooms);
  } else if (pageType === 'audiocall') {
    handleSocketEvents(io, socket, audioCallUsers, audioCallQueue, audioCallRooms);
  } else if (pageType === 'videocall') {
    handleSocketEvents(io, socket, videoCallUsers, videoCallQueue, videoCallRooms);
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

// Uncomment the following lines if you want to log the server status at regular intervals

// setInterval(() => {
//   console.log(`Text Chat Rooms: ${textChatRooms.size}, Text Chat Queue: ${textChatQueue.length}, Text Chat Users: ${textChatUsers.size}`);
//   // console.log(`Audio Call Rooms: ${audioCallRooms.size}, Audio Call Queue: ${audioCallQueue.length}, Audio Call Users: ${audioCallUsers.size}`);
//   console.log(`Video Call Rooms: ${videoCallRooms.size}, Video Call Queue: ${videoCallQueue.length}, Video Call Users: ${videoCallUsers.size}`);
// }, 20000);
