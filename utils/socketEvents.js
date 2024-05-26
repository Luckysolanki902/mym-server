const { emitRoundedUsersCount } = require('./countingUtils');

function handleSocketEvents(io, socket, usersMap, userQueue, userRooms) {

    socket.on('identify', (data) => {
        try {
            const {
                userEmail,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;

            if (!userEmail) {
                throw new Error('Invalid user identification data.');
            }

            socket.userEmail = userEmail;
            let userId = userEmail;

            emitRoundedUsersCount(io, usersMap.size);

            usersMap.set(userId, {
                socket,
                userEmail,
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
            }

        } catch (error) {
            console.error('Error in identify event:', error.message);
        }
    });

    socket.on('userTyping', (data) => {
        try {
            const { userEmail } = data;
            const user = usersMap.get(userEmail);

            if (user && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('userTyping', userEmail);
            }
        } catch (error) {
            console.error('Error in userTyping event:', error.message);
        }
    });

    socket.on('userStoppedTyping', (data) => {
        try {
            const { userEmail } = data;
            const user = usersMap.get(userEmail);

            if (user && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('userStoppedTyping', userEmail);
            }
        } catch (error) {
            console.error('Error in userStoppedTyping event:', error.message);
        }
    });

    socket.on('findNewPair', (data) => {
        try {
            const user = usersMap.get(socket.userEmail);
            if (!user) {
                return;
            }

            if (user.isPaired && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('pairDisconnected', { pair: socket.userEmail }); // Emit "Pair disconnected" to the previous paired user
                // Leave the room, reset paired user info
                socket.leave(user.room);
                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            emitRoundedUsersCount(io, usersMap.size);

            // Update user's information and preferences
            const {
                userEmail,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;
            user.userEmail = userEmail;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;

            // Push the user back into the queue for pairing
            userQueue.push(userEmail);

        } catch (error) {
            console.error('Error in findNewPair event:', error.message);
        }
    });

    socket.on('findNewPairWhenSomeoneLeft', (data) => {
        try {
            const user = usersMap.get(socket.userEmail);
            if (!user) {
                return;
            }

            if (user.isPaired && user.room && user.pairedSocketId) {
                socket.leave(user.room);
                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            emitRoundedUsersCount(io, usersMap.size);

            // Update user's information and preferences
            const {
                userEmail,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
            } = data;
            user.userEmail = userEmail;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;

            // Push the user back into the queue for pairing
            userQueue.push(userEmail);

        } catch (error) {
            console.error('Error in findNewPair event:', error.message);
        }
    });

    

    socket.on('message', (data) => {
        try {
            const { type, content, userEmail } = data;
            const user = usersMap.get(userEmail);

            if (type === 'message' && user && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('message', { type: 'message', sender: userEmail, content });
            }
        } catch (error) {
            console.error('Error in message event:', error.message);
        }
    });
    socket.on('stopFindingPair', () => {
        try {

            const userId = socket.userEmail;
            removeUserFromQueue(userId, userQueue, usersMap, userRooms);

        } catch (error) {
            console.error('Error in stopFindingPair event:', error.message);
        }
    });


    socket.on('disconnect', () => {
        try {
            if (socket.userEmail && usersMap.has(socket.userEmail)) {
                const user = usersMap.get(socket.userEmail);

                if (user.isPaired && user.room) {
                    removeUserFromQueue(socket.userEmail, userQueue, usersMap, userRooms);
                    io.to(user.room).emit('pairDisconnected');
                    socket.leave(user.room);
                    user.isPaired = false;
                    user.room = null;
                    user.pairedSocketId = null;
                }
            }
        } catch (error) {
            console.error('Error handling disconnect event:', error.message);
        }
    });
}

function removeUserFromQueue(userId, queue, usersMap, userRooms) {
    try {
        if (!userId) {
            return;
        }

        const index = queue.indexOf(userId);
        if (index !== -1) {
            queue.splice(index, 1);
        }

        const user = usersMap.get(userId);

        if (user && user.room) {
            const roomId = user.room;
            userRooms.delete(roomId);
        }
    } catch (error) {
        console.error('Error removing user from queue:', error.message);
    }
}

module.exports = handleSocketEvents;
