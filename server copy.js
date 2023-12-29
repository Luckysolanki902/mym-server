// Required modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Creating an Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Configuring CORS settings
  cors: {
    origin: '*', // Allowing requests from all origins (for demonstration purposes; change in production)
    methods: ['GET', 'POST'], // Specifying allowed HTTP methods
  },
});

// Implementing CORS middleware 
app.use(cors());

// Port configuration
const PORT = process.env.PORT || 3001;

// Array to keep track of connected users
let userConnections = [];

// Socket.IO event handlers
io.on('connection', (socket) => {
  // Logging when a new socket connection is established
  console.log(`Socket connected: ${socket.id}`);

  // When a user connects to the application
  socket.on('user connected', (data) => {
    const { displayname } = data;
    console.log(`${displayname} logged in`);

    // Storing user's connection information
    const userConnection = {
      connectionId: socket.id,
      userId: displayname,
    };

    // Adding user's connection to the array
    userConnections.push(userConnection);
    console.log(`User connected: ${displayname} (Socket ID: ${socket.id})`);

    // Counting the number of users online
    const usersOnline = userConnections.length;
    console.log('Users Online: ', usersOnline);
  });

  // When an offer is sent to a remote user
  socket.on('offerSentToRemote', (data) => {
    const offerReceiver = userConnections.find((user) => user.userId === data.remoteuser);
    if (offerReceiver) {
      console.log('offerReceiver is: ', offerReceiver.connectionId);
      socket.to(offerReceiver.connectionId).emit('ReceiveOffer', data);
    }
  });

  // When an answer is sent to a user
  socket.on('answerSentToUser1', (data) => {
    const answerReceiver = userConnections.find((user) => user.userId === data.receiver);
    if (answerReceiver) {
      console.log('answerReceiver is: ', answerReceiver.connectionId);
      socket.to(answerReceiver.connectionId).emit('ReceiveAnswer', data);
    }
  });

  // When candidate information is sent to a user
  socket.on('candidateSentToUser', (data) => {
    const candidateReceiver = userConnections.find((user) => user.userId === data.remoteuser);
    if (candidateReceiver) {

      socket.to(candidateReceiver.connectionId).emit('candidateReceiver', data);
    }
  });

  // Tracking information sent to a user
  socket.on('ontrack', (data) => {
    const receiverSocketId = userConnections.find((user) => user.userId === data.remoteuser)?.connectionId;
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('remoteTrack', data);
    }
  });

  // When a user disconnects from the application
  socket.on('disconnect', () => {
    console.log('User disconnected');

    // Filtering out the disconnected user from the array
    userConnections = userConnections.filter((user) => user.connectionId !== socket.id);

    // Logging remaining users after disconnection
    console.log('Remaining users: ', userConnections.map((user) => user.userId));
  });
});

// Start the server on the specified port
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
