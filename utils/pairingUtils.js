const { v4: uuidv4 } = require('uuid');

function pairUsers(queue, users, io) {
  if (queue.length >= 2) {
    const userId1 = queue.shift();
    const userId2 = queue.shift();

    const user1 = users.get(userId1);
    const user2 = users.get(userId2);
    console.log(user1, user2)
    if (user1 && user2) {
      // Ensure both users still meet each other's preferences
      if (checkPreferences(user1, user2)) {
        const roomId = uuidv4();

        // Pair the users
        user1.isPaired = true;
        user1.room = roomId;
        user1.pairedSocketId = user2.socket.id;

        user2.isPaired = true;
        user2.room = roomId;
        user2.pairedSocketId = user1.socket.id;

        // Join the users to the room
        user1.socket.join(roomId);
        user2.socket.join(roomId);

        // Emit pairing success events
        user1.socket.emit('pairingSuccess', { roomId, strangerGender: user2.userGender, stranger: user2.userEmail });
        user2.socket.emit('pairingSuccess', { roomId, strangerGender: user1.userGender, stranger: user1.userEmail });
      } else {
        // Users don't meet each other's preferences, put them back in the queue
        queue.push(userId1, userId2);
      }
    }
  }
}

function checkPreferences(user1, user2) {
  // Implement your preference checking logic here
  return (
    (user1.preferredCollege === 'any' || user1.preferredCollege === user2.userCollege) &&
    (user2.preferredCollege === 'any' || user2.preferredCollege === user1.userCollege) &&
    (user1.preferredGender === 'any' || user1.preferredGender === user2.userGender) &&
    (user2.preferredGender === 'any' || user2.preferredGender === user1.userGender)
  );
}

function getPairedUserId(users, io, roomId, userId) {
  const room = io.sockets.adapter.rooms.get(roomId);

  if (room) {
    for (const id of room) {
      if (id !== userId && users.has(id)) {
        return id;
      }
    }
  }
  return null;
}



module.exports = { pairUsers, getPairedUserId };
