const { emitRoundedUsersCount } = require('./countingUtils');
const { v4: uuidv4 } = require('uuid');

function pairUsers(userQueue, usersMap, io, userRooms) {
  try {
    if (!userQueue || userQueue.length < 2) {
      throw new Error('Insufficient users in the queue.');
    }

    const userId1 = userQueue.shift();
    const userId2 = userQueue.shift();

    const user1 = usersMap.get(userId1);
    const user2 = usersMap.get(userId2);

    if (!user1 || !user2) {
      throw new Error('Invalid user data.');
    }

    const preferenceMatch = checkPreferences(user1, user2);

    if (preferenceMatch) {
      const room = createRoom(user1, user2, userRooms);
      user1.isPaired = true;
      user1.room = room;
      user1.pairedSocketId = user2.socket.id;
      user2.isPaired = true;
      user2.room = room;
      user2.pairedSocketId = user1.socket.id;

      user1.socket.join(room);
      user2.socket.join(room);
      user1.socket.emit('pairingSuccess', { room, strangerGender: user2.userGender, stranger: user2.userEmail });
      user2.socket.emit('pairingSuccess', { room, strangerGender: user1.userGender, stranger: user1.userEmail });
      emitRoundedUsersCount(io, usersMap.size);
    } else {
      userQueue.push(userId1, userId2);
    }
  } catch (error) {
    console.error('Error in pairUsers:', error.message);
  }
}

function createRoom(user1, user2, userRooms) {
  try {
    const roomId = generateRoomId();
    userRooms.set(roomId, {
      user1,
      user2,
    });
    return roomId;
  } catch (error) {
    console.error('Error in createRoom:', error.message);
    throw error;
  }
}

function checkPreferences(user1, user2) {
  // Add your preference matching logic here
  return (
    (user1.preferredGender === 'any' || user1.preferredGender === user2.userGender) &&
    (user1.preferredCollege === 'any' || user1.preferredCollege === user2.userCollege) &&
    (user2.preferredGender === 'any' || user2.preferredGender === user1.userGender) &&
    (user2.preferredCollege === 'any' || user2.preferredCollege === user1.userCollege)
  );
}

function generateRoomId() {
  try {
    return uuidv4();
  } catch (error) {
    console.error('Error in generateRoomId:', error.message);
    throw error;
  }
}


module.exports = { pairUsers };
