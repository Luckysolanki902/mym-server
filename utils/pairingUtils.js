const { emitRoundedUsersCount } = require('./countingUtils');
const { v4: uuidv4 } = require('uuid');

function pairUsers(userQueue, usersMap, io, userRooms) {
  try {
    if (!userQueue || userQueue.length < 2) {
      return;
    }

    for (let i = 0; i < Math.floor(userQueue.length / 2); i++) {
      const userId = userQueue.shift();
      const user = usersMap.get(userId);

      if (!user) {
        console.log('User is not defined');
        continue; // Skip to the next iteration if user is not defined
      }

      const potentialMatches = userQueue.filter((otherUserId) => {
        const otherUser = usersMap.get(otherUserId);
        return otherUser && checkPreferences(user, otherUser);
      });

      if (potentialMatches.length > 0) {
        const randomIndex = Math.floor(Math.random() * potentialMatches.length);
        const matchedUserId = potentialMatches[randomIndex];

        const matchedUser = usersMap.get(matchedUserId);

        const room = createRoom(user, matchedUser, userRooms);
        user.isPaired = true;
        user.room = room;
        user.pairedSocketId = matchedUser.socket.id;
        matchedUser.isPaired = true;
        matchedUser.room = room;
        matchedUser.pairedSocketId = user.socket.id;

        user.socket.join(room);
        matchedUser.socket.join(room);
        user.socket.emit('pairingSuccess', {
          room,
          strangerGender: matchedUser.userGender,
          stranger: matchedUser.userEmail,
        });
        matchedUser.socket.emit('pairingSuccess', {
          room,
          strangerGender: user.userGender,
          stranger: user.userEmail,
        });

        emitRoundedUsersCount(io, usersMap.size);
      } else {
        userQueue.push(userId); // Put the user back in the queue since no match was found
      }
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
