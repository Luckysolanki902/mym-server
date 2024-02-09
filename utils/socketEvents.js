const { pairUsers, sendMessageToRoom, getPairedUserId } = require('./pairingUtils');
const { emitRoundedUsersCount } = require('./countingUtils');

function handleSocketEvents(io, socket, users, rooms) {
  let userId = null;

  console.log('A User connected');

  socket.on('identify', (data) => {
    emitRoundedUsersCount(io, users);

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
    });

    socket.on('typing', () => {
      if (userId && users.has(userId)) {
        const { room } = users.get(userId);
        if (rooms.has(room)) {
          const pair = rooms.get(room);
          pair.forEach((pairedUserId) => {
            if (pairedUserId !== userId && users.has(pairedUserId)) {
              const receiverSocket = users.get(pairedUserId).socket;
              receiverSocket.emit('userTyping', userId);
            }
          });
        }
      }
    });

    socket.on('stoppedTyping', () => {
      if (userId && users.has(userId)) {
        const { room } = users.get(userId);
        if (rooms.has(room)) {
          const pair = rooms.get(room);
          pair.forEach((pairedUserId) => {
            if (pairedUserId !== userId && users.has(pairedUserId)) {
              const receiverSocket = users.get(pairedUserId).socket;
              receiverSocket.emit('userStoppedTyping', userId);
            }
          });
        }
      }
    });

    socket.on('findNewPair', (data) => {
      emitRoundedUsersCount(io, users);
      if (userId && users.has(userId)) {
        const {
          userEmail,
          userGender,
          userCollege,
          preferredGender,
          preferredCollege
        } = data;

        const user = users.get(userId);
        user.userEmail = userEmail;
        user.userGender = userGender;
        user.userCollege = userCollege;
        user.preferredGender = preferredGender;
        user.preferredCollege = preferredCollege;

        const {
          room,
          isPaired
        } = user;

        if (isPaired && room && rooms.has(room)) {
          const pairedUserId = getPairedUserId(users, rooms, room, userId);

          if (pairedUserId && users.has(pairedUserId)) {
            const pairedUser = users.get(pairedUserId);
            pairedUser.socket.emit('pairDisconnected');
            rooms.delete(room);
          }

          rooms.delete(room);
          user.isPaired = false;
          user.room = null;
        }

        pairUsers(userId, users, rooms);
      }
    });

    console.log('users online are:', users.size)
    pairUsers(userId, users, rooms);
  });

  socket.on('message', (data) => {
    const { type, content } = data;

    if (type === 'message' && userId && users.has(userId)) {
      const { room } = users.get(userId);
      sendMessageToRoom(users, rooms, room, userId, content);
    }
  });

  socket.on('disconnect', () => {
    console.log('A User disconnected');
    if (userId && users.has(userId)) {
      const {
        room,
        isPaired
      } = users.get(userId);
      users.delete(userId);

      if (isPaired && room && rooms.has(room)) {
        const pairedUserId = getPairedUserId(users, rooms, room, userId);

        if (pairedUserId && users.has(pairedUserId)) {
          const pairedUser = users.get(pairedUserId);
          pairedUser.socket.emit('pairDisconnectedStrict');
          users.delete(pairedUserId);
        }

        rooms.delete(room);
      }
    }
  });
}

module.exports = handleSocketEvents;
