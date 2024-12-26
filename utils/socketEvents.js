require('dotenv').config();
const CryptoJS = require('crypto-js');

const secretKey = process.env.SECRET_KEY;

/**
 * Encrypts a message using AES encryption.
 * @param {string} message - The plain text message to encrypt.
 * @param {string} secretKey - The secret key for encryption.
 * @returns {string} - The encrypted message.
 */
const encryptMessage = (message, secretKey) => {
    return CryptoJS.AES.encrypt(message, secretKey).toString();
};

/**
 * Decrypts an AES encrypted message.
 * @param {string} encryptedMessage - The encrypted message to decrypt.
 * @param {string} secretKey - The secret key for decryption.
 * @returns {string} - The decrypted plain text message.
 */
const decryptMessage = (encryptedMessage, secretKey) => {
    const bytes = CryptoJS.AES.decrypt(encryptedMessage, secretKey);
    return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Handles various socket events for user interactions.
 * @param {object} io - The Socket.IO server instance.
 * @param {object} socket - The individual socket connection.
 * @param {Map} usersMap - A map of user IDs to user data.
 * @param {Array} userQueue - The queue of users waiting to be paired.
 * @param {Map} userRooms - A map of room IDs to room data.
 */
function handleSocketEvents(io, socket, usersMap, userQueue, userRooms) {
    /**
     * Helper function to add timestamps to logs.
     * @param {string} level - The log level (info, warn, error).
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
     * Event: identify
     * Registers a user with their details.
     */
    socket.on('identify', (data) => {
        try {
            const {
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;

            if (!userMID) {
                throw new Error('Invalid user identification data: Missing userMID.');
            }

            socket.userMID = userMID;
            const userId = userMID;

            usersMap.set(userId, {
                socket,
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isPaired: false,
                room: null,
                pairedSocketId: null,
            });

            if (!userQueue.includes(userId)) {
                userQueue.push(userId);
                log('info', `User added to queue: ${userMID}`);
            } else {
                log('warn', `User ${userMID} is already in the queue.`);
            }

            log('info', `User identified: ${userMID}`);
        } catch (error) {
            log('error', `Identify event error: ${error.message}`);
        }
    });

    /**
     * Event: userTyping
     * Notifies the paired user that someone is typing.
     */
    socket.on('userTyping', (data) => {
        try {
            const { userMID } = data;
            const user = usersMap.get(userMID);

            if (user && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('userTyping', userMID);
                log('info', `UserTyping event emitted from ${userMID} to ${user.pairedSocketId}`);
            } else {
                log('warn', `UserTyping event: User or pairing information missing for ${userMID}`);
            }
        } catch (error) {
            log('error', `UserTyping event error: ${error.message}`);
        }
    });

    /**
     * Event: userStoppedTyping
     * Notifies the paired user that someone has stopped typing.
     */
    socket.on('userStoppedTyping', (data) => {
        try {
            const { userMID } = data;
            const user = usersMap.get(userMID);

            if (user && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('userStoppedTyping', userMID);
                log('info', `UserStoppedTyping event emitted from ${userMID} to ${user.pairedSocketId}`);
            } else {
                log('warn', `UserStoppedTyping event: User or pairing information missing for ${userMID}`);
            }
        } catch (error) {
            log('error', `UserStoppedTyping event error: ${error.message}`);
        }
    });

    /**
     * Event: findNewPair
     * Initiates finding a new pair for the user.
     */
    socket.on('findNewPair', (data) => {
        try {
            const user = usersMap.get(socket.userMID);
            if (!user) {
                log('warn', `findNewPair event: User not found for socket ID ${socket.id}`);
                return;
            }

            if (user.isPaired && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('pairDisconnected', { pair: socket.userMID });
                socket.leave(user.room);
                log('info', `Pair disconnected for user ${socket.userMID} from room ${user.room}`);

                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            // Update user's information and preferences
            const {
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;
            user.userMID = userMID;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;

            // Push the user back into the queue for pairing
            userQueue.push(userMID);
            log('info', `User ${userMID} re-added to queue for new pairing.`);
        } catch (error) {
            log('error', `FindNewPair event error: ${error.message}`);
        }
    });

    /**
     * Event: findNewPairWhenSomeoneLeft
     * Handles finding a new pair when someone leaves unexpectedly.
     */
    socket.on('findNewPairWhenSomeoneLeft', (data) => {
        try {
            const user = usersMap.get(socket.userMID);
            if (!user) {
                log('warn', `findNewPairWhenSomeoneLeft event: User not found for socket ID ${socket.id}`);
                return;
            }

            if (user.isPaired && user.room && user.pairedSocketId) {
                socket.leave(user.room);
                log('info', `User ${socket.userMID} left room ${user.room} due to pair disconnection.`);

                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            // Update user's information and preferences
            const {
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;
            user.userMID = userMID;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;

            // Push the user back into the queue for pairing
            userQueue.push(userMID);
            log('info', `User ${userMID} re-added to queue after pair left.`);
        } catch (error) {
            log('error', `FindNewPairWhenSomeoneLeft event error: ${error.message}`);
        }
    });

    /**
     * Event: message
     * Handles sending and receiving encrypted messages between paired users.
     */
    socket.on('message', (data) => {
        try {
            const { type, content, userMID } = data;
            const user = usersMap.get(userMID);

            if (type === 'message' && user && user.room && user.pairedSocketId) {
                const decryptedMessage = decryptMessage(content, secretKey);
                const encryptedMessageForReceiver = encryptMessage(decryptedMessage, secretKey);
                io.to(user.pairedSocketId).emit('message', {
                    type: 'message',
                    sender: userMID,
                    content: encryptedMessageForReceiver
                });
                log('info', `Message from ${userMID} forwarded to ${user.pairedSocketId}`);
            } else {
                log('warn', `Message event: Invalid user or pairing information for ${userMID}`);
            }
        } catch (error) {
            log('error', `Message event error: ${error.message}`);
        }
    });

    /**
     * Event: stopFindingPair
     * Allows a user to stop searching for a pair.
     */
    socket.on('stopFindingPair', () => {
        try {
            const userId = socket.userMID;
            removeUserFromQueue(userId, userQueue, usersMap, userRooms);
            log('info', `User ${userId} stopped searching for a pair.`);
        } catch (error) {
            log('error', `StopFindingPair event error: ${error.message}`);
        }
    });

    /**
     * Event: disconnect
     * Handles user disconnection.
     */
    socket.on('disconnect', () => {
        try {
            if (socket.userMID && usersMap.has(socket.userMID)) {
                const user = usersMap.get(socket.userMID);

                if (user.isPaired && user.room) {
                    io.to(user.room).emit('pairDisconnected', { pair: socket.userMID });
                    socket.leave(user.room);
                    log('info', `User ${socket.userMID} disconnected and left room ${user.room}`);
                }

                removeUserFromQueue(socket.userMID, userQueue, usersMap, userRooms);
                usersMap.delete(socket.userMID);
                log('info', `User ${socket.userMID} removed from usersMap upon disconnect.`);
            } else {
                log('warn', `Disconnect event: No userMID found for socket ID ${socket.id}`);
            }
        } catch (error) {
            log('error', `Disconnect event error: ${error.message}`);
        }
    });
}

/**
 * Removes a user from the queue and cleans up their room if necessary.
 * @param {string} userId - The ID of the user to remove.
 * @param {Array} queue - The queue from which to remove the user.
 * @param {Map} usersMap - The map of users.
 * @param {Map} userRooms - The map of rooms.
 */
function removeUserFromQueue(userId, queue, usersMap, userRooms) {
    try {
        if (!userId) {
            console.warn('removeUserFromQueue: Invalid userId.');
            return;
        }

        const index = queue.indexOf(userId);
        if (index !== -1) {
            queue.splice(index, 1);
            console.info(`removeUserFromQueue: User ${userId} removed from queue.`);
        } else {
            console.warn(`removeUserFromQueue: User ${userId} not found in queue.`);
        }

        const user = usersMap.get(userId);

        if (user && user.room) {
            const roomId = user.room;
            userRooms.delete(roomId);
            console.info(`removeUserFromQueue: Room ${roomId} deleted for user ${userId}.`);
        }
    } catch (error) {
        console.error(`removeUserFromQueue error: ${error.message}`);
    }
}

module.exports = handleSocketEvents;
