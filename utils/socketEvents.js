const { pairUsers} = require('./pairingUtils');
const { emitRoundedUsersCount } = require('./countingUtils');

function handleSocketEvents(io, socket, usersMap, userQueue, userRooms) {
    console.log('A User connected');

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
 
            userQueue.push(userId);

            console.log(`Users online are:`, usersMap.size);
            pairUsers(userQueue, usersMap, io, userRooms);
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
            console.log('finding new');
    
            emitRoundedUsersCount(io, usersMap.size);
    
            let user = usersMap.get(socket.userEmail);
    
            if (!user) {
                // User not found, run identify event
                socket.emit('identify', data);
                return;
            }
    
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
    
            let userId = userEmail;
    
            if (user.isPaired && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('pairDisconnected');
                socket.leave(user.room);
                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }
            userRooms.delete(user.room);
    
            userQueue.push(userId);
            pairUsers(userQueue, usersMap, io, userRooms);
            console.log(userQueue.length, 'is the length of queue')
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
            console.log('User stopped finding pair');
            
            const userId = socket.userEmail;
            removeUserFromQueue(userId, userQueue, usersMap, userRooms);
    
        } catch (error) {
            console.error('Error in stopFindingPair event:', error.message);
        }
    });
    
    
    socket.on('offer', (data) => {
        try {
            const { sdp, roomId } = data;
            const user = usersMap.get(socket.userEmail);

            if (user && user.room === roomId && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('offer', { sdp, roomId });
            }
        } catch (error) {
            console.error('Error in offer event:', error.message);
        }
    });

    socket.on('answer', (data) => {
        try {
            const { sdp, roomId } = data;
            const user = usersMap.get(socket.userEmail);

            if (user && user.room === roomId && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('answer', { sdp, roomId });
            }
        } catch (error) {
            console.error('Error in answer event:', error.message);
        }
    });

    socket.on('add-ice-candidate', (data) => {
        try {
            const { candidate, type, roomId } = data;
            const user = usersMap.get(socket.userEmail);

            if (user && user.room === roomId && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('add-ice-candidate', { candidate, type, roomId });
            }
        } catch (error) {
            console.error('Error in add-ice-candidate event:', error.message);
        }
    });


    socket.on('disconnect', () => {
        try {
            console.log('A User disconnected');
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

        console.log(user, 'room')
        if (user && user.room) {
            const roomId = user.room;
            userRooms.delete(roomId);
        }
    } catch (error) {
        console.error('Error removing user from queue:', error.message);
    }
}

module.exports = handleSocketEvents;
