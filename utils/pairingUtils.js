// utils/pairingUtils.js

const { v4: uuidv4 } = require('uuid');

/**
 * Helper function to add timestamps to logs.
 * @param {string} level - The log level ('info', 'warn', 'error').
 * @param {string} message - The log message.
 */
const log = (level, message) => {
  const timestamp = new Date().toISOString();
  switch (level) {
    case 'info':
      console.info(`[${timestamp}] INFO: ${message}`);
      break;
    case 'warn':
      console.warn(`[${timestamp}] WARN: ${message}`);
      break;
    case 'error':
      console.error(`[${timestamp}] ERROR: ${message}`);
      break;
    default:
      console.log(`[${timestamp}] ${message}`);
  }
};

/**
 * Pairs users from the queue based on their preferences.
 * @param {Array} userQueue - The queue of users waiting to be paired.
 * @param {Map} usersMap - A map of user IDs to user data.
 * @param {object} io - The Socket.IO server instance.
 * @param {Map} userRooms - A map of room IDs to room data.
 */
function pairUsers(userQueue, usersMap, io, userRooms) {
  try {
    if (!userQueue || userQueue.length < 2) {
      log('info', 'pairUsers: Not enough users to pair.');
      return;
    }

    const pairedUsers = new Set(); // Keep track of paired users to avoid duplicate pairing

    const totalPairs = Math.floor(userQueue.length / 2);
    log('info', `pairUsers: Attempting to create ${totalPairs} pair(s).`);

    for (let i = 0; i < totalPairs; i++) {
      const userId = userQueue.shift();
      const user = usersMap.get(userId);

      if (!user) {
        log('warn', `pairUsers: User ID ${userId} not found in usersMap.`);
        continue; // Skip to the next iteration if user is not defined
      }

      if (pairedUsers.has(userId)) {
        log('warn', `pairUsers: User ID ${userId} has already been paired in this iteration.`);
        continue;
      }

      let potentialMatches = userQueue.filter((otherUserId) => {
        const otherUser = usersMap.get(otherUserId);
        return otherUser && !pairedUsers.has(otherUserId) && checkPreferences(user, otherUser);
      });

      if (potentialMatches.length === 0) {
        // If no suitable match found based on preferences, pair randomly
        log('info', `pairUsers: No preference-based match found for User ID ${userId}. Attempting random pairing.`);
        potentialMatches = userQueue.filter((otherUserId) => !pairedUsers.has(otherUserId));
      }

      if (potentialMatches.length > 0) {
        const randomIndex = Math.floor(Math.random() * potentialMatches.length);
        const matchedUserId = potentialMatches[randomIndex];

        const matchedUserIndex = userQueue.indexOf(matchedUserId);
        if (matchedUserIndex !== -1) {
          userQueue.splice(matchedUserIndex, 1); // Remove the matched user from the queue
          log('info', `pairUsers: Matched User ID ${userId} with User ID ${matchedUserId}.`);
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
        log('info', `pairUsers: Users ${user.userMID} and ${matchedUser.userMID} joined room ${room}.`);

        user.socket.emit('pairingSuccess', {
          room,
          strangerGender: matchedUser.userGender,
          stranger: matchedUser.userMID,
          isStrangerVerified: matchedUser.isVerified,
        });
        matchedUser.socket.emit('pairingSuccess', {
          room,
          strangerGender: user.userGender,
          stranger: user.userMID,
          isStrangerVerified: user.isVerified,
        });

        log('info', `pairUsers: Emitted pairingSuccess to Users ${user.userMID} and ${matchedUser.userMID}.`);

      } else {
        userQueue.push(userId); // Put the user back in the queue since no match was found
        log('warn', `pairUsers: No match found for User ID ${userId}. User re-added to the queue.`);
      }
    }
  } catch (error) {
    log('error', `pairUsers: ${error.message}`);
  }
}

/**
 * Creates a new room for paired users.
 * @param {object} user1 - The first user.
 * @param {object} user2 - The second user.
 * @param {Map} userRooms - A map of room IDs to room data.
 * @returns {string} - The generated room ID.
 */
function createRoom(user1, user2, userRooms) {
  try {
    const roomId = generateRoomId();
    userRooms.set(roomId, {
      user1,
      user2,
    });
    log('info', `createRoom: Room ${roomId} created for Users ${user1.userMID} and ${user2.userMID}.`);
    return roomId;
  } catch (error) {
    log('error', `createRoom: ${error.message}`);
    throw error;
  }
}

/**
 * Checks if two users match based on their preferences.
 * @param {object} user1 - The first user.
 * @param {object} user2 - The second user.
 * @returns {boolean} - Whether the users match based on preferences.
 */
function checkPreferences(user1, user2) {
  // Add your preference matching logic here
  const match =
    (user1.preferredGender === 'any' || user1.preferredGender === user2.userGender) &&
    (user1.preferredCollege === 'any' || user1.preferredCollege === user2.userCollege) &&
    (user2.preferredGender === 'any' || user2.preferredGender === user1.userGender) &&
    (user2.preferredCollege === 'any' || user2.preferredCollege === user1.userCollege);

  log('info', `checkPreferences: Users ${user1.userMID} and ${user2.userMID} preference match: ${match}`);
  return match;
}

/**
 * Generates a unique room ID.
 * @returns {string} - The generated room ID.
 */
function generateRoomId() {
  try {
    const roomId = uuidv4();
    log('info', `generateRoomId: Generated Room ID ${roomId}.`);
    return roomId;
  } catch (error) {
    log('error', `generateRoomId: ${error.message}`);
    throw error;
  }
}

module.exports = { pairUsers };
