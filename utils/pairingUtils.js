const { emitRoundedUsersCount } = require('./countingUtils');
const { v4: uuidv4 } = require('uuid');

function pairUsers(userQueue, usersMap, io, userRooms) {
  try {
    if (!userQueue || userQueue.length < 2) {
      return;
    }

    const pairedUsers = new Set(); // Keep track of paired users to avoid duplicate pairing

    for (let i = 0; i < Math.floor(userQueue.length / 2); i++) {
      const userId = userQueue.shift();
      const user = usersMap.get(userId);

      if (!user) {
        continue; // Skip to the next iteration if user is not defined
      }

      if (pairedUsers.has(userId)) {
        // Skip if the user has already been paired in this iteration
        continue;
      }

      let potentialMatches = userQueue.filter((otherUserId) => {
        const otherUser = usersMap.get(otherUserId);
        return otherUser && !pairedUsers.has(otherUserId) && checkPreferences(user, otherUser);
      });

      if (potentialMatches.length === 0) {
        // If no suitable match found based on preferences, pair randomly
        potentialMatches = userQueue.filter((otherUserId) => !pairedUsers.has(otherUserId));
      }

      if (potentialMatches.length > 0) {
        const randomIndex = Math.floor(Math.random() * potentialMatches.length);
        const matchedUserId = potentialMatches[randomIndex];

        const matchedUserIndex = userQueue.indexOf(matchedUserId);
        if (matchedUserIndex !== -1) {
          userQueue.splice(matchedUserIndex, 1); // Remove the matched user from the queue
        }

        pairedUsers.add(userId);
        pairedUsers.add(matchedUserId);

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
    const roomId = uuidv4();
    return roomId;
  } catch (error) {
    console.error('Error in generateRoomId:', error.message);
    throw error;
  }
}

module.exports = { pairUsers };
