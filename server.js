const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const handleSocketEvents = require('./utils/socketEvents');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*', // Allow requests from all origins
  methods: ['GET', 'POST'],
}));

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Separate user-maps for each type of chat
const textChatUsers = new Map();
const audioCallUsers = new Map();
const videoCallUsers = new Map();
// Create centralized queues for each chat type
const textChatQueue = [];
const audioCallQueue = [];
const videoCallQueue = [];

io.on('connection', (socket) => {
  handleSocketEvents(io, socket, textChatUsers, audioCallUsers, videoCallUsers, textChatQueue, audioCallQueue, videoCallQueue);
});

server.listen(1000, () => {
  console.log('Server started');
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
