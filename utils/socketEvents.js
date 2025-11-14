require('dotenv').config();
const CryptoJS = require('crypto-js');
const PairingLogger = require('./PairingLogger');

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
 * @param {Array} userQueue - The queue of users waiting to be paired (legacy, not used with EnhancedPairingManager).
 * @param {Map} userRooms - A map of room IDs to room data.
 * @param {EnhancedPairingManager} pairingManager - The enhanced pairing manager instance.
 */
function handleSocketEvents(io, socket, usersMap, userQueue, userRooms, pairingManager) {
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
                isVerified,
            } = data;

            if (!userMID) {
                throw new Error('Invalid user identification data: Missing userMID.');
            }

            // Validate socket is actually connected
            if (!socket || !socket.connected) {
                PairingLogger.error('Identify failed - socket not connected', { 
                    userMID, 
                    hasSocket: !!socket,
                    connected: socket?.connected 
                });
                return;
            }

            PairingLogger.socket('User identifying', { userMID, userGender, userCollege, preferredGender, preferredCollege, isVerified, socketId: socket.id });

            socket.userMID = userMID;
            const userId = userMID;

            // Check if user already exists with a different socket
            const existingUser = usersMap.get(userId);
            if (existingUser && existingUser.socket.id !== socket.id) {
                PairingLogger.warn('User already connected with different socket, disconnecting old socket', { 
                    userMID, 
                    oldSocketId: existingUser.socket.id, 
                    newSocketId: socket.id 
                });
                // Disconnect the old socket
                existingUser.socket.disconnect(true);
                // Remove from pairing queue
                pairingManager.removeFromQueue(userId);
            }

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
                isVerified,
                state: 'WAITING'
            });

            // Add to enhanced pairing queue
            pairingManager.addToQueue(userId, {
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isVerified,
            });

            PairingLogger.queue('User added to queue', { userMID, queueStats: pairingManager.queue.getStats() });

            PairingLogger.socket('User identified successfully', { userMID, socketId: socket.id });
        } catch (error) {
            PairingLogger.error('Identify event error', { error: error.message, stack: error.stack });
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
                PairingLogger.socket('UserTyping event', { from: userMID, to: user.pairedSocketId, room: user.room });
            } else {
                PairingLogger.socket('UserTyping event failed - user not paired', { userMID, hasPairing: !!user?.pairedSocketId });
            }
        } catch (error) {
            PairingLogger.error('UserTyping event error', { error: error.message, stack: error.stack });
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
                PairingLogger.socket('UserStoppedTyping event', { from: userMID, to: user.pairedSocketId, room: user.room });
            } else {
                PairingLogger.socket('UserStoppedTyping event failed - user not paired', { userMID, hasPairing: !!user?.pairedSocketId });
            }
        } catch (error) {
            PairingLogger.error('UserStoppedTyping event error', { error: error.message, stack: error.stack });
        }
    });

    /**
     * Event: findNewPair
     * Initiates finding a new pair for the user.
     */
    socket.on('findNewPair', (data) => {
        try {
            // Validate socket connection first
            if (!socket || !socket.connected) {
                PairingLogger.error('findNewPair failed - socket not connected', { 
                    socketId: socket?.id,
                    hasSocket: !!socket,
                    connected: socket?.connected 
                });
                return;
            }

            const user = usersMap.get(socket.userMID);
            if (!user) {
                PairingLogger.socket('findNewPair event failed - user not found', { socketId: socket.id, userMID: socket.userMID });
                return;
            }

            // Validate user socket matches current socket
            if (user.socket.id !== socket.id) {
                PairingLogger.warn('findNewPair - socket ID mismatch, updating', {
                    userMID: socket.userMID,
                    oldSocketId: user.socket.id,
                    newSocketId: socket.id
                });
                user.socket = socket;
            }

            PairingLogger.socket('findNewPair event received', { 
                socketId: socket.id, 
                userMID: socket.userMID,
                currentState: { isPaired: user.isPaired, inRoom: user.room, state: user.state }
            });

            // Disconnect from current pair if exists
            if (user.isPaired && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('pairDisconnected', { pair: socket.userMID });
                socket.leave(user.room);
                
                // Update partner's state
                for (const [partnerMID, partnerUser] of usersMap.entries()) {
                    if (partnerUser.socket.id === user.pairedSocketId) {
                        partnerUser.isPaired = false;
                        partnerUser.room = null;
                        partnerUser.pairedSocketId = null;
                        partnerUser.state = 'DISCONNECTED';
                        PairingLogger.socket('Partner state updated on findNewPair', { 
                            requester: socket.userMID, 
                            partner: partnerMID 
                        });
                        break;
                    }
                }
                
                PairingLogger.pairing('User requesting new pair - disconnecting from current pair', { 
                    userMID: socket.userMID, 
                    previousRoom: user.room, 
                    previousPair: user.pairedSocketId 
                });

                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            // Remove from queue if already in queue (prevent duplicates)
            pairingManager.removeFromQueue(socket.userMID);
            PairingLogger.queue('User removed from queue before re-adding', { userMID: socket.userMID });

            // Update user's information and preferences
            const {
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isVerified,
            } = data;
            user.userMID = userMID;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;
            user.isVerified = isVerified;
            user.state = 'WAITING'; // Explicitly set to WAITING state

            // Add user back to enhanced pairing queue
            pairingManager.addToQueue(userMID, {
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isVerified,
            });
            
            PairingLogger.queue('User re-added to queue for new pairing', { userMID, queueStats: pairingManager.queue.getStats() });
        } catch (error) {
            PairingLogger.error('FindNewPair event error', { error: error.message, stack: error.stack });
        }
    });

    /**
     * Event: findNewPairWhenSomeoneLeft
     * Handles finding a new pair when someone leaves unexpectedly.
     */
    socket.on('findNewPairWhenSomeoneLeft', (data) => {
        try {
            // Validate socket connection first
            if (!socket || !socket.connected) {
                PairingLogger.error('findNewPairWhenSomeoneLeft failed - socket not connected', { 
                    socketId: socket?.id,
                    hasSocket: !!socket,
                    connected: socket?.connected 
                });
                return;
            }

            const user = usersMap.get(socket.userMID);
            if (!user) {
                PairingLogger.socket('findNewPairWhenSomeoneLeft event failed - user not found', { socketId: socket.id, userMID: socket.userMID });
                return;
            }

            // Validate user socket matches current socket
            if (user.socket.id !== socket.id) {
                PairingLogger.warn('findNewPairWhenSomeoneLeft - socket ID mismatch, updating', {
                    userMID: socket.userMID,
                    oldSocketId: user.socket.id,
                    newSocketId: socket.id
                });
                user.socket = socket;
            }

            PairingLogger.socket('findNewPairWhenSomeoneLeft event received', { 
                socketId: socket.id, 
                userMID: socket.userMID,
                currentState: { isPaired: user.isPaired, inRoom: user.room, state: user.state }
            });

            // Clean up room state - whether DISCONNECTED or still CHATTING
            if (user.room || user.pairedSocketId) {
                if (user.room) {
                    socket.leave(user.room);
                }
                PairingLogger.pairing('User finding new pair after partner left', { 
                    userMID: socket.userMID, 
                    previousRoom: user.room, 
                    previousPair: user.pairedSocketId,
                    previousState: user.state
                });

                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            // Remove from queue if already in queue (prevent duplicates)
            pairingManager.removeFromQueue(socket.userMID);
            PairingLogger.queue('User removed from queue before re-adding', { userMID: socket.userMID });

            // Update user's information and preferences
            const {
                userMID,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isVerified,
            } = data;
            user.userMID = userMID;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;
            user.isVerified = isVerified;
            user.state = 'WAITING'; // Explicitly set to WAITING state

            // Add user back to enhanced pairing queue
            pairingManager.addToQueue(userMID, {
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                isVerified,
            });
            
            PairingLogger.queue('User re-added to queue after pair left', { userMID, queueStats: pairingManager.queue.getStats() });
        } catch (error) {
            PairingLogger.error('FindNewPairWhenSomeoneLeft event error', { error: error.message, stack: error.stack });
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
                PairingLogger.socket('Message forwarded', { from: userMID, to: user.pairedSocketId, room: user.room });
            } else {
                PairingLogger.socket('Message event failed - invalid pairing', { userMID, hasPairing: !!user?.pairedSocketId });
            }
        } catch (error) {
            PairingLogger.error('Message event error', { error: error.message, stack: error.stack });
        }
    });

    /**
     * Event: stopFindingPair
     * Allows a user to stop searching for a pair.
     */
    socket.on('stopFindingPair', () => {
        try {
            const userId = socket.userMID;
            pairingManager.removeFromQueue(userId);
            PairingLogger.queue('User stopped searching for pair', { userMID: userId, queueStats: pairingManager.queue.getStats() });
        } catch (error) {
            PairingLogger.error('StopFindingPair event error', { error: error.message, stack: error.stack });
        }
    });

    /**
     * Event: updateFilters
     * Allows a user to update their filter preferences while in queue
     */
    socket.on('updateFilters', (data) => {
        try {
            const { userMID, preferredGender, preferredCollege } = data;
            
            PairingLogger.socket('Filter update request received', {
                userMID,
                socketId: socket.id,
                newFilters: { preferredGender, preferredCollege },
                queueContainsUser: pairingManager.queue.contains(userMID),
                queueSize: pairingManager.queue.size(),
                userInMap: usersMap.has(userMID)
            });

            // Validate filters
            const validGenders = ['male', 'female', 'any'];
            if (!validGenders.includes(preferredGender)) {
                socket.emit('filtersUpdateFailed', {
                    success: false,
                    message: 'Invalid preferred gender'
                });
                return;
            }

            // Update filters in queue
            const result = pairingManager.updateFiltersInQueue(userMID, {
                preferredGender,
                preferredCollege
            });

            if (result.success) {
                // Emit success event back to user
                socket.emit('filtersUpdated', {
                    success: true,
                    message: 'Filters updated successfully',
                    position: result.data.position,
                    waitTime: result.data.waitTime,
                    newFilters: result.data.newFilters
                });

                PairingLogger.success('Filters updated successfully', {
                    userMID,
                    position: result.data.position,
                    newFilters: result.data.newFilters
                });
            } else {
                // Emit failure event
                socket.emit('filtersUpdateFailed', {
                    success: false,
                    message: result.message
                });

                PairingLogger.warn('Failed to update filters', {
                    userMID,
                    reason: result.message
                });
            }
        } catch (error) {
            PairingLogger.error('UpdateFilters event error', { error: error.message, stack: error.stack });
            socket.emit('filtersUpdateFailed', {
                success: false,
                message: 'Server error updating filters'
            });
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
                    // Notify the paired user
                    io.to(user.room).emit('pairDisconnected', { pair: socket.userMID });
                    socket.leave(user.room);
                    
                    // CRITICAL FIX: Update the partner's state so they can't be paired again
                    // until they explicitly click Find New
                    if (user.pairedSocketId) {
                        // Find the partner by socket ID
                        for (const [partnerMID, partnerUser] of usersMap.entries()) {
                            if (partnerUser.socket.id === user.pairedSocketId) {
                                // Reset partner's pairing state
                                partnerUser.isPaired = false;
                                partnerUser.room = null;
                                partnerUser.pairedSocketId = null;
                                partnerUser.state = 'DISCONNECTED'; // Mark as disconnected, not WAITING
                                
                                // Remove partner from queue if they somehow ended up there
                                pairingManager.removeFromQueue(partnerMID);
                                
                                PairingLogger.socket('Partner state reset after disconnect', {
                                    disconnectedUser: socket.userMID,
                                    partner: partnerMID,
                                    partnerNewState: 'DISCONNECTED'
                                });
                                break;
                            }
                        }
                    }
                    
                    PairingLogger.socket('User disconnected from active pair', { 
                        userMID: socket.userMID, 
                        room: user.room, 
                        pairedWith: user.pairedSocketId 
                    });
                }

                // Remove from enhanced pairing queue
                pairingManager.removeFromQueue(socket.userMID);
                usersMap.delete(socket.userMID);
                PairingLogger.socket('User removed from system on disconnect', { 
                    userMID: socket.userMID, 
                    queueStats: pairingManager.queue.getStats() 
                });
            } else {
                PairingLogger.socket('Disconnect event - no userMID found', { socketId: socket.id });
            }
        } catch (error) {
            PairingLogger.error('Disconnect event error', { error: error.message, stack: error.stack, socketId: socket.id });
        }
    });
}

module.exports = handleSocketEvents;
