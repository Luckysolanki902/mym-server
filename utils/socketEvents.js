const { pairUsers, getPairedUserId } = require('./pairingUtils');
const { emitRoundedUsersCount } = require('./countingUtils');

function handleSocketEvents(io, socket, textChatUsers, audioCallUsers, videoCallUsers) {
  let userId = null;
  let usersMap = null;

  console.log('A User connected');

  socket.on('identify', (data) => {
    const {
      pageType,
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege,
    } = data;

    userId = userEmail;

    // Choose the appropriate map based on the page type
    switch (pageType) {
      case 'textchat':
        usersMap = textChatUsers;
        break;
      case 'audiocall':
        usersMap = audioCallUsers;
        break;
      case 'videocall':
        usersMap = videoCallUsers;
        break;
      default:
      // Handle default case or error
    }
    emitRoundedUsersCount(io, usersMap.size);

    usersMap.set(userId, {
      socket,
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege,
      isPaired: false,
      room: null,
      pairedSocketId: null // Add for storing paired socket IDs
    });

    console.log(`Users online for ${pageType} are:`, usersMap.size);
    pairUsers(userId, usersMap, io);
  });

  socket.on('typing', () => {
    const user = usersMap.get(userId);
    if (user && user.room && user.pairedSocketId) {
      io.to(user.pairedSocketId).emit('userTyping', userId);
    }
  });

  socket.on('stoppedTyping', () => {
    const user = usersMap.get(userId);
    if (user && user.room && user.pairedSocketId) {
      io.to(user.pairedSocketId).emit('userStoppedTyping', userId);
    }
  });

  socket.on('findNewPair', (data) => {
    emitRoundedUsersCount(io, usersMap.size);

    const user = usersMap.get(userId);
    if (user) {
      const {
        userEmail,
        userGender,
        userCollege,
        preferredGender,
        preferredCollege
      } = data;
      user.userEmail = userEmail;
      user.userGender = userGender;
      user.userCollege = userCollege;
      user.preferredGender = preferredGender;
      user.preferredCollege = preferredCollege;

      if (user.isPaired && user.room && user.pairedSocketId) {
        io.to(user.pairedSocketId).emit('pairDisconnected');

        socket.leave(user.room);
        user.isPaired = false;
        user.room = null;
        user.pairedSocketId = null; // Reset pairedSocketId when unpairing
      }

      // Pair the user with a new partner
      pairUsers(userId, usersMap, io);
    }
  });

  socket.on('message', (data) => {
    const { type, content } = data;
    const user = usersMap.get(userId);

    if (type === 'message' && user && user.room && user.pairedSocketId) {
      io.to(user.pairedSocketId).emit('message', { type: 'message', sender: userId, content });
    }
  });

  socket.on('disconnect', () => {
    console.log('A User disconnected');
    if (userId && usersMap.has(userId)) {
      const user = usersMap.get(userId);

      if (user.isPaired && user.room && user.pairedSocketId) {
        const pairedUserId = getPairedUserId(usersMap, io, user.room, userId);
        if (pairedUserId && usersMap.has(pairedUserId)) {
          const pairedUser = usersMap.get(pairedUserId);
          try {
            pairedUser.socket.emit('pairDisconnected');
            pairedUser.socket.leave(user.room);
            pairedUser.isPaired = false; // Update pairings status
            pairedUser.room = null;
            pairedUser.pairedSocketId = null;
          } catch (error) {
            console.error('Error handling room cleanup:', error);
          }
        }
      }
      usersMap.delete(userId);
    }
  });
}

module.exports = handleSocketEvents;
