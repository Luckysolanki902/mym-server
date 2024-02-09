// utils/pairingUtils.js
const { v4: uuidv4 } = require('uuid');

function pairUsers(userId, users, rooms) {
  const user = users.get(userId);

  let bestMatch = null;
  let maxScore = -1;

  for (const otherUser of users.values()) {
    if (
      !otherUser.isPaired &&
      otherUser.userEmail !== userId &&
      (
        otherUser.preferredGender === user.userGender ||
        otherUser.preferredGender === 'any' ||
        user.preferredGender === 'any'
      ) &&
      (
        otherUser.preferredCollege === user.preferredCollege ||
        otherUser.preferredCollege === 'any' ||
        user.preferredCollege === 'any'
      )
    ) {
      const score = (
        (otherUser.preferredGender === user.userGender ? 1 : 0) +
        (otherUser.preferredCollege === user.preferredCollege ? 1 : 0)
      );

      if (score > maxScore) {
        maxScore = score;
        bestMatch = otherUser;
      }
    }
  }

  if (bestMatch) {
    const roomId = uuidv4();

    // Pair the users and create a room
    user.isPaired = true;
    user.room = roomId;
    bestMatch.isPaired = true;
    bestMatch.room = roomId;

    rooms.set(roomId, [userId, bestMatch.userEmail]);

      user.socket.emit('pairingSuccess', {
        roomId,
        strangerGender: bestMatch.userGender,
        stranger: bestMatch.userEmail,
      });
      bestMatch.socket.emit('pairingSuccess', {
        roomId,
        strangerGender: user.userGender,
      });

    console.log('Made a pair');
  }
}

function sendMessageToRoom(users, rooms, roomId, senderUserId, content) {
  if (rooms.has(roomId)) {
    const pair = rooms.get(roomId);
    pair.forEach((userId) => {
      if (userId !== senderUserId && users.has(userId)) {
        const receiverSocket = users.get(userId).socket;
        receiverSocket.emit('message', { type: 'message', sender: senderUserId, content });
      }
    });
  }
}

function getPairedUserId(users, rooms, roomId, userId) {
  if (rooms.has(roomId)) {
    const pair = rooms.get(roomId);
    return pair.find((id) => id !== userId && users.has(id));
  }
  return null;
}

module.exports = { pairUsers, sendMessageToRoom, getPairedUserId };
