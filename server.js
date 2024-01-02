require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
app.use(cors());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Connection error:', error);
  });

const User = require('./models/User');

const activeUsers = new Map(); // Store active users waiting for pairing

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user connected', async ({ userName, strangerGender, strangerCollege }) => {
    const user = await User.findOneAndUpdate({ email: userName }, { $set: { isPaired: false, isActive: true } }, { new: true }).exec();
    if (user) {
      activeUsers.set(socket.id, {
        id: socket.id,
        user,
        preferences: {
          strangerGender,
          strangerCollege,
        },
      });

      tryPairing(socket);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);

    if (activeUsers.has(socket.id)) {
      const { user } = activeUsers.get(socket.id);
      user.isActive = false; // Set user as inactive

      const partnerId = getPartnerId(socket.id); // Function to get partner ID
      if (partnerId) {
        io.to(partnerId).emit('partnerDisconnected'); // Notify the partner
        const partner = activeUsers.get(partnerId);
        partner.user.isPaired = false; // Set partner's isPaired to false
        await User.findOneAndUpdate({ email: partner.user.email }, { $set: { isPaired: false } }).exec();
      }

      await User.findOneAndUpdate({ email: user.email }, { $set: { isActive: false } }).exec();

      activeUsers.delete(socket.id);
      // Handle user leaving the chat (notify the partner, etc.)
    }
  });

  socket.on('newPairing', ({ strangerGender, strangerCollege }) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      if (!user.preferences) {
        user.preferences = {}; // Initialize preferences if not defined
      }
      user.preferences.strangerGender = strangerGender;
      user.preferences.strangerCollege = strangerCollege;
  
      tryPairing(socket);
    }
  });

  // Inside the 'message' event listener in the server code
  socket.on('message', (data) => {
    const { room, message } = data;
    // Emit message to the chat room
    io.to(room).emit('message', { message, sender: socket.id });
    console.log(message, socket.id, room)
    // Log the message being sent
    console.log(`Message sent from ${socket.id} in room ${room}: ${message}`);
    // Implement message storage, validation, etc., here
  });


  socket.on('typing', (room) => {
    socket.to(room).emit('typing', socket.id);
  });

  socket.on('stoppedTyping', (room) => {
    socket.to(room).emit('stoppedTyping', socket.id);
  });
});

const getPartnerId = (currentSocketId) => {
  for (const [key, value] of activeUsers) {
    if (key !== currentSocketId) {
      return key; // Return partner's socket ID
    }
  }
  return null;
};

const tryPairing = async (socket) => {
  const usersArray = Array.from(activeUsers.values());

  for (let i = 0; i < usersArray.length - 1; i++) {
    const currentUser = usersArray[i];

    if (!currentUser.user.isPaired && currentUser.user.isActive) {
      for (let j = i + 1; j < usersArray.length; j++) {
        const user = usersArray[j];

        if (
          user.user.isActive &&
          !user.user.isPaired &&
          user.user.email !== currentUser.user.email &&
          (currentUser.preferences.strangerGender === 'any' || currentUser.preferences.strangerGender === user.user.gender) &&
          (currentUser.preferences.strangerCollege === 'any' || currentUser.preferences.strangerCollege === user.user.college)
        ) {
          currentUser.user.isPaired = true;
          user.user.isPaired = true;

          const room = `chat-room-${currentUser.id}-${user.id}`;
          socket.join(room);
          io.to(user.id).emit('chatStart', { room });
          socket.emit('chatStart', { room });

          // Log the connection between user1 and user2
          console.log(`${currentUser.user.email} and ${user.user.email} got connected to each other in the room ${room}`);

          // Use Promise.all to save both documents sequentially
          await Promise.all([
            User.findOneAndUpdate({ email: currentUser.user.email }, { $set: { isPaired: true } }).exec(),
            User.findOneAndUpdate({ email: user.user.email }, { $set: { isPaired: true } }).exec(),
          ]);

          return;
        }
      }
    }
  }

  // Reset 'isPaired' status for users who are not paired after a delay
  setTimeout(() => {
    for (const user of usersArray) {
      if (!user.user.isPaired && user.user.isActive) {
        user.user.isPaired = false;
      }
    }
    tryPairing(socket);
  }, 2000); // Adjust the delay duration as needed
};



const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
