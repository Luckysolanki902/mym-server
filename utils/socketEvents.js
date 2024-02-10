const { pairUsers, sendMessageToRoom, getPairedUserId } = require('./pairingUtils');
const { emitRoundedUsersCount } = require('./countingUtils');

function handleSocketEvents(io, socket, users) {
  let userId = null;

  console.log('A User connected');

  socket.on('identify', (data) => {
    emitRoundedUsersCount(io, users.size);

    const {
      userEmail,
      userGender,
      userCollege,
      preferredGender,
      preferredCollege
    } = data;

    userId = userEmail;

    users.set(userId, {
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

    console.log('users online are:', users.size);
    pairUsers(userId, users, io);
  });

  socket.on('typing', () => {
    const user = users.get(userId);
    if (user && user.room && user.pairedSocketId) {
      io.to(user.pairedSocketId).emit('userTyping', userId);
    }
  });

  socket.on('stoppedTyping', () => {
    const user = users.get(userId);
    if (user && user.room && user.pairedSocketId) { 
      io.to(user.pairedSocketId).emit('userStoppedTyping', userId);
    }
  });

  socket.on('findNewPair', (data) => {
    emitRoundedUsersCount(io, users.size);

    const user = users.get(userId);
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

      if (user.isPaired && user.room) {
        socket.leave(user.room);
        user.isPaired = false;
        user.room = null;
        user.pairedSocketId = null; // Reset pairedSocketId when unpairing
      }

      pairUsers(userId, users, io); 
    } 
  });

  socket.on('message', (data) => {
    const { type, content } = data;
    const user = users.get(userId);

    if (type === 'message' && user && user.room && user.pairedSocketId) {
      io.to(user.pairedSocketId).emit('message', { type: 'message', sender: userId, content }); 
    }
  });

  socket.on('disconnect', () => {
    console.log('A User disconnected');
    if (userId && users.has(userId)) {
      const user = users.get(userId);

      if (user.isPaired && user.room && user.pairedSocketId) {   
        const pairedUserId = getPairedUserId(users, io, user.room, userId);
        if (pairedUserId && users.has(pairedUserId)) {
          const pairedUser = users.get(pairedUserId);
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
      users.delete(userId); 
    }
  });
}

module.exports = handleSocketEvents; 
