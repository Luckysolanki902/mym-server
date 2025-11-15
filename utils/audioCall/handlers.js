const PairingLogger = require('../PairingLogger');
const audioCallMetrics = require('./metrics');
const { CALL_STATES, MIC_STATUS, setUserCallState, setMicStatus, normalizeMicStatus } = require('./state');
const { TONES } = require('./constants');

const getUser = (usersMap, userMID) => {
  if (!userMID) return null;
  return usersMap.get(userMID);
};

const getPartnerBySocketId = (io, user) => {
  if (!user || !user.pairedSocketId) {
    return null;
  }
  return io.sockets.sockets.get(user.pairedSocketId) || null;
};

const emitToPartner = (io, user, event, payload) => {
  if (!user?.pairedSocketId) return;
  io.to(user.pairedSocketId).emit(event, payload);
};

module.exports = function handleAudioCallEvents(io, socket, usersMap, userRooms) {
  const updateHeartbeat = (user) => {
    if (user) {
      user.lastHeartbeat = Date.now();
    }
  };

  socket.on('micPermissionResult', ({ userMID, status }) => {
    const user = getUser(usersMap, userMID || socket.userMID);
    if (!user) return;
    const normalizedStatus = normalizeMicStatus(status || user.micStatus || MIC_STATUS.UNKNOWN);
    setMicStatus(user, normalizedStatus);
    PairingLogger.state('Mic permission updated', {
      userMID: user.userMID,
      status: normalizedStatus,
      socketId: socket.id,
    });
    socket.emit('micStatusAck', { status: normalizedStatus });
  });

  socket.on('callReady', ({ userMID, peerId }) => {
    const user = getUser(usersMap, userMID || socket.userMID);
    if (!user) return;
    user.peerId = peerId;
    setUserCallState(user, CALL_STATES.DIALING);
    emitToPartner(io, user, 'remoteReady', { peerId: user.peerId });
    io.to(user.socket.id).emit('playTone', { tone: TONES.DIAL });
    emitToPartner(io, user, 'playTone', { tone: TONES.DIAL });
    PairingLogger.state('Call ready', { userMID: user.userMID, peerId, socketId: socket.id });
  });

  socket.on('callConnected', ({ userMID, roomId }) => {
    const user = getUser(usersMap, userMID || socket.userMID);
    if (!user) return;
    const room = roomId || user.room;
    setUserCallState(user, CALL_STATES.CONNECTED);
    if (room) {
      audioCallMetrics.startCall(room);
    }
    io.to(user.socket.id).emit('playTone', { tone: TONES.CONNECTED });
    emitToPartner(io, user, 'playTone', { tone: TONES.CONNECTED });
    PairingLogger.state('Call connected', { roomId: room, userMID: user.userMID, socketId: socket.id });
  });

  socket.on('callQuality', ({ userMID, rtt, jitter, packetLoss }) => {
    const user = getUser(usersMap, userMID || socket.userMID);
    if (!user) return;
    if (user.room) {
      audioCallMetrics.recordQuality(user.room, { rtt, jitter, packetLoss });
    }
  });

  socket.on('callEnded', ({ userMID, reason = 'hangup' }) => {
    const user = getUser(usersMap, userMID || socket.userMID);
    if (!user) return;

    setUserCallState(user, CALL_STATES.ENDED);
    io.to(user.socket.id).emit('playTone', { tone: TONES.DISCONNECTED });
    emitToPartner(io, user, 'callEnded', { reason, peer: user.userMID });

    if (user.room) {
      audioCallMetrics.endCall(user.room, reason);
    }

    const partnerSocket = getPartnerBySocketId(io, user);
    if (partnerSocket) {
      partnerSocket.emit('playTone', { tone: TONES.DISCONNECTED });
    }

    PairingLogger.state('Call ended', { roomId: user.room, reason, userMID: user.userMID, socketId: socket.id });
  });

  socket.on('callHeartbeat', () => {
    const user = getUser(usersMap, socket.userMID);
    updateHeartbeat(user);
  });

  socket.on('disconnect', () => {
    const user = getUser(usersMap, socket.userMID);
    if (!user) return;

    if (user.room) {
      audioCallMetrics.endCall(user.room, 'disconnect');
      emitToPartner(io, user, 'callEnded', { reason: 'disconnect', peer: user.userMID });
      emitToPartner(io, user, 'playTone', { tone: TONES.DISCONNECTED });
    }

    PairingLogger.state('Audio socket disconnected', { userMID: user.userMID, socketId: socket.id });
  });
};
