require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const User = require('./models/User');
const app = express();
const mongoose = require("mongoose");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
}); 
app.use(cors());

mongoose.connect(process.env.MONGODB_URI, {
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('Connection error:', error);
});

const usersFindingPair = {};
const pairingDurationInSeconds = 10; // Define the duration for attempting pairing (editable)

io.on('connection', async (socket) => {
  socket.on('user connected', async ({ displayName, strangerGender, strangerCollege }) => {
    console.log(`User connected: ${displayName} and wants stranger to be ${strangerGender} from ${strangerCollege} college`);
    let user = await User.findOne({ email: displayName });

    if (user) {
      await user.toggleActivity(true);

      usersFindingPair[socket.id] = {
        displayName: displayName,
        isActive: user.isActive,
        isPaired: user.isPaired,
        gender: user.gender,
        college: user.college,
      };

      const tryPairing = setInterval(async () => {
        const connectedUserIds = Object.keys(usersFindingPair);
        const availableUsers = connectedUserIds.filter(
          (id) =>
            !usersFindingPair[id].isPaired &&
            id !== socket.id &&
            usersFindingPair[id].isActive &&
            usersFindingPair[id].gender === strangerGender &&
            (strangerCollege === 'any' || usersFindingPair[id].college === strangerCollege)
        );

        if (availableUsers.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableUsers.length);
          const randomUser = usersFindingPair[availableUsers[randomIndex]];

          if (randomUser) {
            user.isPaired = true;
            await user.save();

            randomUser.isPaired = true;
            await User.findOneAndUpdate({ email: randomUser.displayName }, { isPaired: true });

            console.log(
              `Users ${displayName} and ${randomUser.displayName} got connected to each other.`
            );

            io.to(socket.id).emit('paired', { displayName, receiver: randomUser.displayName });
            io.to(availableUsers[randomIndex]).emit('paired', {
              displayName: randomUser.displayName,
              receiver: displayName,
            });

            clearInterval(tryPairing); // Stop trying to pair once successful
          }
        }
      }, 1000); // Check for pairing every second

      setTimeout(() => {
        clearInterval(tryPairing); // Stop trying to pair after the specified duration
      }, pairingDurationInSeconds * 1000);
    } else {
      console.log(`User ${displayName} not found in the database.`);
    }
  });

  socket.on('sendMessage', ({ sender, receiver, message }) => {
    console.log(sender, receiver, message)
    console.log(`Message from ${sender} to ${receiver}: ${message}`);

    const recipientSocketId = Object.keys(usersFindingPair)
      .find(id => usersFindingPair[id].displayName === receiver);

    const senderSocketId = Object.keys(usersFindingPair)
      .find(id => usersFindingPair[id].displayName === sender);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receiveMessage', { sender, message });
      console.log('receiving logs:', sender, message)
    } else {
      console.log(`User ${receiver} is not connected.`);
      // Handle the case where the recipient is not connected
    }

    if (senderSocketId) {
      io.to(senderSocketId).emit('receiveMessage', { sender, message });
    } else {
      console.log(`User ${sender} is not connected.`);
      // Handle the case where the sender is not connected
    }
  });

  socket.on('disconnect', async () => {
    if (usersFindingPair[socket.id]) {
      const disconnectedUser = usersFindingPair[socket.id].displayName;
      let user = await User.findOne({ email: disconnectedUser });
      if (user) {
        await user.toggleActivity(false);
        await user.togglePairedStatus(false);
      }
      delete usersFindingPair[socket.id];
      console.log(`User disconnected: ${disconnectedUser}`);
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
 