const { pairUsers, getPairedUserId } = require('./pairingUtils');
const { emitRoundedUsersCount } = require('./countingUtils');


function handleSocketEvents(io, socket, textChatUsers, audioCallUsers, videoCallUsers, textChatQueue, audioCallQueue, videoCallQueue) {
    let userId = null;
    let usersMap = null;
    let userQueue = null;

    console.log('A User connected');

    socket.on('identify', (data) => {
        const {
            userEmail,
            userGender,
            userCollege,
            preferredGender,
            preferredCollege,
            pageType
        } = data;



        userId = userEmail;


        switch (pageType) {
            case 'textchat':
                usersMap = textChatUsers;
                userQueue = textChatQueue;
                break;
            case 'audiocall':
                usersMap = audioCallUsers;
                userQueue = audioCallQueue;
                break;
            case 'videocall':
                usersMap = videoCallUsers;
                userQueue = videoCallQueue;
                break;
            default:
                usersMap = textChatUsers;
                userQueue = textChatQueue;
                break;
        }

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

        console.log(`Users online for ${pageType} are:`, usersMap.size);
        pairUsers(queue, users, io, pageType);
    });

    socket.on('typing', () => {
        const user = usersMap.get(userId);
        if (user && user.room && user.pairedSocketId) {
            io.to(user.pairedSocketId).emit('userTyping', userId);
        }
    });

    socket.on('stoppedTyping', () => {
        const user = usersMap.get(userId);
        if (user && user.room && user.pairedSocketId) {
            io.to(user.pairedSocketId).emit('userStoppedTyping', userId);
        }
    });

    socket.on('findNewPair', (data) => {
        console.log(userQueue)
        emitRoundedUsersCount(io, usersMap.size);

        const user = usersMap.get(userId);

        if (user) {
            const {
                userEmail,
                userGender,
                userCollege,
                preferredGender,
                preferredCollege,
                pageType
            } = data;
            user.userEmail = userEmail;
            user.userGender = userGender;
            user.userCollege = userCollege;
            user.preferredGender = preferredGender;
            user.preferredCollege = preferredCollege;

            if (user.isPaired && user.room && user.pairedSocketId) {
                io.to(user.pairedSocketId).emit('pairDisconnected');
                socket.leave(user.room);
                user.isPaired = false;
                user.room = null;
                user.pairedSocketId = null;
            }

            userQueue.push(userId);
            pairUsers(queue, users, io, pageType);
        }
    });

    socket.on('message', (data) => {
        const { type, content } = data;
        const user = usersMap.get(userId);

        if (type === 'message' && user && user.room && user.pairedSocketId) {
            io.to(user.pairedSocketId).emit('message', { type: 'message', sender: userId, content });
        }
    });

    socket.on('disconnect', () => {
        console.log('A User disconnected');
        if (userId && usersMap.has(userId)) {
            const user = usersMap.get(userId);

            if (user.isPaired && user.room && user.pairedSocketId) {
                const pairedUserId = getPairedUserId(usersMap, io, user.room, userId);
                if (pairedUserId && usersMap.has(pairedUserId)) {
                    const pairedUser = usersMap.get(pairedUserId);

                    try {
                        pairedUser.socket.emit('pairDisconnected');
                        pairedUser.socket.leave(user.room);
                        pairedUser.isPaired = false;
                        pairedUser.room = null;
                        pairedUser.pairedSocketId = null;
                    } catch (error) {
                        console.error('Error handling room cleanup:', error);
                    }
                }
            }

            usersMap.delete(userId);
            removeUserFromQueue(userId, userQueue);
        }
    });
}


function removeUserFromQueue(userId, queue) {
    const index = queue.indexOf(userId);
    if (index !== -1) {
        queue.splice(index, 1);
    }
}

module.exports = handleSocketEvents;
