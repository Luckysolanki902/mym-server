const PairingLogger = require('./PairingLogger');
const { AUDIO_CALL_STUN_SERVERS, AUDIO_CALL_ICE_CONFIG } = require('./audioCallConfig');

const CALL_STATUS = {
  WAITING_FOR_PEER: 'WAITING_FOR_PEER',
  READY: 'READY',
  CONNECTING: 'CONNECTING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED'
};

const NEGOTIATION_EVENTS = {
  OFFER: 'rtcOffer',
  ANSWER: 'rtcAnswer',
  ICE: 'rtcIceCandidate',
  RENEGOTIATION: 'callNegotiationNeeded'
};

const HEARTBEAT_TIMEOUT_MS = 20000;

function getPartnerUser(usersMap, pairedSocketId) {
  if (!pairedSocketId) {
    return null;
  }

  for (const [, candidate] of usersMap.entries()) {
    if (candidate.socket.id === pairedSocketId) {
      return candidate;
    }
  }

  return null;
}

function emitCallReady(io, user, partner) {
  if (!user || !partner) {
    return;
  }

  const role = user.userMID < partner.userMID ? 'initiator' : 'receiver';
  const timestamp = Date.now();

  const payload = {
    room: user.room,
    peerId: user.peerId,
    partnerPeerId: partner.peerId,
    partnerMid: partner.userMID,
    partnerGender: partner.userGender,
    partnerIsVerified: partner.isVerified,
    role,
    peerServerPath: '/peerjs',
    iceConfig: AUDIO_CALL_ICE_CONFIG,
    stunServers: AUDIO_CALL_STUN_SERVERS,
    issuedAt: timestamp
  };

  try {
    io.to(user.socket.id).emit('callReady', payload);
    PairingLogger.success('Call handshake emitted', {
      user: user.userMID,
      partner: partner.userMID,
      room: user.room,
      role
    });
  } catch (error) {
    PairingLogger.error('Failed to emit callReady', {
      error: error.message,
      user: user.userMID,
      partner: partner.userMID
    });
  }
}

function attemptHandshake(io, usersMap, user) {
  if (!user || !user.peerId || !user.isPaired || !user.room) {
    return;
  }

  const partner = getPartnerUser(usersMap, user.pairedSocketId);
  if (!partner || !partner.peerId) {
    return;
  }

  if (user.callStatus === CALL_STATUS.READY) {
    return;
  }

  user.callStatus = CALL_STATUS.READY;
  partner.callStatus = CALL_STATUS.READY;

  emitCallReady(io, user, partner);
  emitCallReady(io, partner, user);
}

function resetCallState(user) {
  if (!user) {
    return;
  }

  user.callStatus = CALL_STATUS.WAITING_FOR_PEER;
  user.peerId = null;
  user.mediaMetrics = null;
  user.callStartedAt = null;
  user.callEndedAt = null;
  user.lastHeartbeatAt = Date.now();
}

function handleAudioCallEvents(io, socket, usersMap, userQueue, userRooms, pairingManager) {
  const forwardEventToPartner = (eventName, userMID, buildPayload) => {
    const user = usersMap.get(userMID);

    if (!user) {
      PairingLogger.warn(`Attempted to forward ${eventName} but user not found`, {
        eventName,
        userMID,
        socketId: socket.id
      });
      return;
    }

    if (!user.pairedSocketId || !user.room) {
      PairingLogger.warn(`Attempted to forward ${eventName} but user is not paired`, {
        eventName,
        userMID,
        room: user.room
      });
      return;
    }

    const partner = getPartnerUser(usersMap, user.pairedSocketId);

    if (!partner || !partner.socket || !partner.socket.connected) {
      PairingLogger.warn(`Attempted to forward ${eventName} but partner socket unavailable`, {
        eventName,
        userMID,
        partnerSocketId: user.pairedSocketId
      });
      return;
    }

    const now = Date.now();
    if (partner && partner.lastHeartbeatAt && now - partner.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      PairingLogger.warn('Partner heartbeat stale during negotiation forwarding', {
        eventName,
        userMID,
        partnerMID: partner.userMID,
        staleForMs: now - partner.lastHeartbeatAt
      });
    }

    const payload = buildPayload({ user, partner });

    if (payload === undefined) {
      return;
    }

    io.to(partner.socket.id).emit(eventName, payload);
    PairingLogger.socket('Audio negotiation event forwarded', {
      event: eventName,
      from: user.userMID,
      to: partner.userMID,
      room: user.room
    });
  };

  const markHeartbeat = (user) => {
    if (user) {
      user.lastHeartbeatAt = Date.now();
    }
  };

  socket.on('identify', (data) => {
    try {
      const {
        userMID,
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      } = data;

      if (!userMID) {
        throw new Error('Invalid user identification data: Missing userMID.');
      }

      if (!socket || !socket.connected) {
        PairingLogger.error('Identify failed - socket not connected', {
          userMID,
          hasSocket: !!socket,
          connected: socket?.connected
        });
        return;
      }

      PairingLogger.socket('Audio user identifying', {
        userMID,
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified,
        socketId: socket.id
      });

      socket.userMID = userMID;
      const userId = userMID;
      const existingUser = usersMap.get(userId);

      if (existingUser && existingUser.socket.id !== socket.id) {
  PairingLogger.warn('Audio user already connected with different socket, disconnecting old socket', {
          userMID,
          oldSocketId: existingUser.socket.id,
          newSocketId: socket.id
        });
        existingUser.socket.disconnect(true);
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
        state: 'WAITING',
        peerId: null,
        callStatus: CALL_STATUS.WAITING_FOR_PEER,
        mediaMetrics: null,
        callStartedAt: null,
        callEndedAt: null,
        lastHeartbeatAt: Date.now()
      });

      pairingManager.addToQueue(userId, {
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      });

      PairingLogger.queue('Audio user added to queue', {
        userMID,
        queueStats: pairingManager.queue.getStats()
      });

      PairingLogger.socket('Audio user identified successfully', {
        userMID,
        socketId: socket.id
      });
    } catch (error) {
      PairingLogger.error('Audio identify event error', {
        error: error.message,
        stack: error.stack
      });
    }
  });

  socket.on('registerPeer', (data = {}) => {
    try {
      const { userMID, peerId } = data;
      if (!userMID || !peerId) {
        throw new Error('registerPeer requires userMID and peerId');
      }

      const user = usersMap.get(userMID);
      if (!user) {
        throw new Error('User not found for registerPeer');
      }

      if (!user.socket || user.socket.id !== socket.id) {
  PairingLogger.warn('registerPeer socket mismatch', {
          userMID,
          storedSocketId: user.socket?.id,
          currentSocketId: socket.id
        });
        user.socket = socket;
      }

      user.peerId = peerId;
      user.callStatus = CALL_STATUS.WAITING_FOR_PEER;
      user.peerServerConfig = AUDIO_CALL_ICE_CONFIG;
      markHeartbeat(user);

      PairingLogger.socket('Peer registered for audio user', {
        userMID,
        peerId,
        room: user.room
      });

      socket.emit('peerRegistered', {
        success: true,
        peerId,
        iceConfig: AUDIO_CALL_ICE_CONFIG,
        stunServers: AUDIO_CALL_STUN_SERVERS
      });

      attemptHandshake(io, usersMap, user);
    } catch (error) {
      PairingLogger.error('registerPeer event error', {
        error: error.message,
        stack: error.stack
      });

      socket.emit('peerRegistered', {
        success: false,
        message: error.message
      });
    }
  });

  socket.on(NEGOTIATION_EVENTS.OFFER, (payload = {}) => {
    const userMID = socket.userMID;
    const { description, restartIce = false, sdpType = 'offer' } = payload;

    if (!userMID || !description) {
      PairingLogger.warn('Received rtcOffer without required payload', {
        socketId: socket.id,
        hasDescription: !!description
      });
      return;
    }

    forwardEventToPartner(NEGOTIATION_EVENTS.OFFER, userMID, ({ user }) => ({
      description,
      restartIce,
      sdpType,
      from: userMID,
      room: user.room
    }));

    markHeartbeat(usersMap.get(userMID));
  });

  socket.on(NEGOTIATION_EVENTS.ANSWER, (payload = {}) => {
    const userMID = socket.userMID;
    const { description, sdpType = 'answer' } = payload;

    if (!userMID || !description) {
      PairingLogger.warn('Received rtcAnswer without required payload', {
        socketId: socket.id,
        hasDescription: !!description
      });
      return;
    }

    forwardEventToPartner(NEGOTIATION_EVENTS.ANSWER, userMID, ({ user }) => ({
      description,
      sdpType,
      from: userMID,
      room: user.room
    }));

    markHeartbeat(usersMap.get(userMID));
  });

  socket.on(NEGOTIATION_EVENTS.ICE, (payload = {}) => {
    const userMID = socket.userMID;
    const { candidate } = payload;

    if (!userMID || !candidate) {
      PairingLogger.warn('Received rtcIceCandidate without candidate data', {
        socketId: socket.id
      });
      return;
    }

    forwardEventToPartner(NEGOTIATION_EVENTS.ICE, userMID, ({ user }) => ({
      candidate,
      from: userMID,
      room: user.room
    }));

    markHeartbeat(usersMap.get(userMID));
  });

  socket.on(NEGOTIATION_EVENTS.RENEGOTIATION, (payload = {}) => {
    const userMID = socket.userMID;

    if (!userMID) {
      PairingLogger.warn('Received callNegotiationNeeded without user context', {
        socketId: socket.id
      });
      return;
    }

    forwardEventToPartner(NEGOTIATION_EVENTS.RENEGOTIATION, userMID, ({ user }) => ({
      reason: payload.reason || 'renegotiation-request',
      from: userMID,
      room: user.room
    }));

    markHeartbeat(usersMap.get(userMID));
  });

  socket.on('callStatusUpdate', (data = {}) => {
    try {
      const { userMID, status } = data;
      const user = usersMap.get(userMID);
      if (!user) {
        return;
      }

      user.callStatus = status || user.callStatus;
      if (status === CALL_STATUS.ACTIVE) {
        user.callStartedAt = Date.now();
      } else if (status === CALL_STATUS.ENDED) {
        user.callEndedAt = Date.now();
      }

      markHeartbeat(user);

      const partner = getPartnerUser(usersMap, user.pairedSocketId);
      if (partner) {
        io.to(partner.socket.id).emit('partnerCallStatus', {
          status,
          userMID
        });
      }
    } catch (error) {
      PairingLogger.error('callStatusUpdate error', {
        error: error.message
      });
    }
  });

  socket.on('callMetrics', (data = {}) => {
    try {
      const { userMID, metrics } = data;
      const user = usersMap.get(userMID);
      if (!user) {
        return;
      }

      user.mediaMetrics = metrics;
      markHeartbeat(user);
      PairingLogger.metrics('Audio call metrics received', {
        userMID,
        metrics
      });
    } catch (error) {
      PairingLogger.error('callMetrics event error', {
        error: error.message
      });
    }
  });

  socket.on('callHeartbeat', () => {
    const userMID = socket.userMID;
    const user = usersMap.get(userMID);
    markHeartbeat(user);
  });

  socket.on('endCall', (data = {}) => {
    try {
      const { userMID, reason } = data;
      const user = usersMap.get(userMID);
      if (!user) {
        return;
      }

      const partner = getPartnerUser(usersMap, user.pairedSocketId);
      PairingLogger.pairing('Audio call ended by user', {
        userMID,
        room: user.room,
        reason
      });

      if (partner) {
        partner.isPaired = false;
        partner.room = null;
        partner.pairedSocketId = null;
        partner.state = 'DISCONNECTED';
        partner.callStatus = CALL_STATUS.ENDED;
        partner.callEndedAt = Date.now();
        io.to(partner.socket.id).emit('callEnded', {
          by: userMID,
          reason: reason || 'user-ended'
        });
      }

      resetCallState(user);
      user.isPaired = false;
      user.room = null;
      user.pairedSocketId = null;
      user.state = 'IDLE';
      user.callStatus = CALL_STATUS.ENDED;
      user.callEndedAt = Date.now();

      pairingManager.removeFromQueue(userMID);
    } catch (error) {
      PairingLogger.error('endCall event error', {
        error: error.message
      });
    }
  });

  socket.on('findNewPair', (data) => {
    try {
      if (!socket || !socket.connected) {
        PairingLogger.error('findNewPair failed - socket not connected (audio)', {
          socketId: socket?.id,
          hasSocket: !!socket,
          connected: socket?.connected
        });
        return;
      }

      const user = usersMap.get(socket.userMID);
      if (!user) {
        PairingLogger.socket('findNewPair (audio) failed - user not found', {
          socketId: socket.id,
          userMID: socket.userMID
        });
        return;
      }

      if (user.socket.id !== socket.id) {
  PairingLogger.warn('findNewPair (audio) - socket ID mismatch, updating', {
          userMID: socket.userMID,
          oldSocketId: user.socket.id,
          newSocketId: socket.id
        });
        user.socket = socket;
      }

      PairingLogger.socket('findNewPair (audio) received', {
        socketId: socket.id,
        userMID: socket.userMID,
        currentState: {
          isPaired: user.isPaired,
          inRoom: user.room,
          state: user.state
        }
      });

      if (user.isPaired && user.room && user.pairedSocketId) {
        const partner = getPartnerUser(usersMap, user.pairedSocketId);
        if (partner) {
          io.to(partner.socket.id).emit('pairDisconnected', {
            pair: socket.userMID,
            reason: 'new-pair-request'
          });
          partner.isPaired = false;
          partner.room = null;
          partner.pairedSocketId = null;
          partner.state = 'DISCONNECTED';
          partner.callStatus = CALL_STATUS.ENDED;
          resetCallState(partner);
        }

        PairingLogger.pairing('Audio user requesting new pair - disconnecting current pair', {
          userMID: socket.userMID,
          previousRoom: user.room,
          previousPair: user.pairedSocketId
        });

        user.isPaired = false;
        user.room = null;
        user.pairedSocketId = null;
        resetCallState(user);
      }

      pairingManager.removeFromQueue(socket.userMID);
      PairingLogger.queue('Audio user removed from queue before re-adding', {
        userMID: socket.userMID
      });

      const {
        userMID,
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      } = data;

      user.userMID = userMID;
      user.userGender = userGender;
      user.userCollege = userCollege;
      user.preferredGender = preferredGender;
      user.preferredCollege = preferredCollege;
      user.isVerified = isVerified;
      user.state = 'WAITING';
      resetCallState(user);

      pairingManager.addToQueue(userMID, {
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      });

      PairingLogger.queue('Audio user re-added to queue for new pairing', {
        userMID,
        queueStats: pairingManager.queue.getStats()
      });
    } catch (error) {
      PairingLogger.error('findNewPair (audio) event error', {
        error: error.message,
        stack: error.stack
      });
    }
  });

  socket.on('findNewPairWhenSomeoneLeft', (data) => {
    try {
      if (!socket || !socket.connected) {
        PairingLogger.error('findNewPairWhenSomeoneLeft failed - socket not connected (audio)', {
          socketId: socket?.id,
          hasSocket: !!socket,
          connected: socket?.connected
        });
        return;
      }

      const user = usersMap.get(socket.userMID);
      if (!user) {
        PairingLogger.socket('findNewPairWhenSomeoneLeft (audio) failed - user not found', {
          socketId: socket.id,
          userMID: socket.userMID
        });
        return;
      }

      if (user.socket.id !== socket.id) {
  PairingLogger.warn('findNewPairWhenSomeoneLeft (audio) - socket ID mismatch, updating', {
          userMID: socket.userMID,
          oldSocketId: user.socket.id,
          newSocketId: socket.id
        });
        user.socket = socket;
      }

      PairingLogger.socket('findNewPairWhenSomeoneLeft (audio) received', {
        socketId: socket.id,
        userMID: socket.userMID,
        currentState: {
          isPaired: user.isPaired,
          inRoom: user.room,
          state: user.state
        }
      });

      if (user.room || user.pairedSocketId) {
        if (user.room) {
          socket.leave(user.room);
        }

        PairingLogger.pairing('Audio user finding new pair after partner left', {
          userMID: socket.userMID,
          previousRoom: user.room,
          previousPair: user.pairedSocketId,
          previousState: user.state
        });

        user.isPaired = false;
        user.room = null;
        user.pairedSocketId = null;
        resetCallState(user);
      }

      pairingManager.removeFromQueue(socket.userMID);
      PairingLogger.queue('Audio user removed from queue before re-adding', {
        userMID: socket.userMID
      });

      const {
        userMID,
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      } = data;

      user.userMID = userMID;
      user.userGender = userGender;
      user.userCollege = userCollege;
      user.preferredGender = preferredGender;
      user.preferredCollege = preferredCollege;
      user.isVerified = isVerified;
      user.state = 'WAITING';
      resetCallState(user);

      pairingManager.addToQueue(userMID, {
        userGender,
        userCollege,
        preferredGender,
        preferredCollege,
        isVerified
      });

      PairingLogger.queue('Audio user re-added to queue after pair left', {
        userMID,
        queueStats: pairingManager.queue.getStats()
      });
    } catch (error) {
      PairingLogger.error('findNewPairWhenSomeoneLeft (audio) event error', {
        error: error.message,
        stack: error.stack
      });
    }
  });

  socket.on('stopFindingPair', () => {
    try {
      const userId = socket.userMID;
      pairingManager.removeFromQueue(userId);
      PairingLogger.queue('Audio user stopped searching for pair', {
        userMID: userId,
        queueStats: pairingManager.queue.getStats()
      });
    } catch (error) {
      PairingLogger.error('stopFindingPair (audio) event error', {
        error: error.message,
        stack: error.stack
      });
    }
  });

  socket.on('updateFilters', (data) => {
    try {
      const { userMID, preferredGender, preferredCollege } = data;

      PairingLogger.socket('Audio filter update request received', {
        userMID,
        socketId: socket.id,
        newFilters: { preferredGender, preferredCollege },
        queueContainsUser: pairingManager.queue.contains(userMID),
        queueSize: pairingManager.queue.size(),
        userInMap: usersMap.has(userMID)
      });

      const validGenders = ['male', 'female', 'any'];
      if (!validGenders.includes(preferredGender)) {
        socket.emit('filtersUpdateFailed', {
          success: false,
          message: 'Invalid preferred gender'
        });
        return;
      }

      const result = pairingManager.updateFiltersInQueue(userMID, {
        preferredGender,
        preferredCollege
      });

      if (result.success) {
        socket.emit('filtersUpdated', {
          success: true,
          message: 'Filters updated successfully',
          position: result.data.position,
          waitTime: result.data.waitTime,
          newFilters: result.data.newFilters
        });

        PairingLogger.success('Audio filters updated successfully', {
          userMID,
          position: result.data.position,
          newFilters: result.data.newFilters
        });
      } else {
        socket.emit('filtersUpdateFailed', {
          success: false,
          message: result.message
        });

  PairingLogger.warn('Failed to update audio filters', {
          userMID,
          reason: result.message
        });
      }
    } catch (error) {
      PairingLogger.error('updateFilters (audio) event error', {
        error: error.message,
        stack: error.stack
      });
      socket.emit('filtersUpdateFailed', {
        success: false,
        message: 'Server error updating filters'
      });
    }
  });

  socket.on('disconnect', () => {
    try {
      if (socket.userMID && usersMap.has(socket.userMID)) {
        const user = usersMap.get(socket.userMID);

        if (user.isPaired && user.room) {
          io.to(user.room).emit('pairDisconnected', {
            pair: socket.userMID,
            reason: 'disconnect'
          });
          socket.leave(user.room);

          if (user.pairedSocketId) {
            const partner = getPartnerUser(usersMap, user.pairedSocketId);
            if (partner) {
              partner.isPaired = false;
              partner.room = null;
              partner.pairedSocketId = null;
              partner.state = 'DISCONNECTED';
              partner.callStatus = CALL_STATUS.ENDED;
              resetCallState(partner);
              pairingManager.removeFromQueue(partner.userMID);

              PairingLogger.socket('Audio partner state reset after disconnect', {
                disconnectedUser: socket.userMID,
                partner: partner.userMID,
                partnerNewState: 'DISCONNECTED'
              });
            }
          }

          PairingLogger.socket('Audio user disconnected from active pair', {
            userMID: socket.userMID,
            room: user.room,
            pairedWith: user.pairedSocketId
          });
        }

        pairingManager.removeFromQueue(socket.userMID);
        usersMap.delete(socket.userMID);

        PairingLogger.socket('Audio user removed from system on disconnect', {
          userMID: socket.userMID,
          queueStats: pairingManager.queue.getStats()
        });
      } else {
        PairingLogger.socket('Audio disconnect event - no userMID found', {
          socketId: socket.id
        });
      }
    } catch (error) {
      PairingLogger.error('Audio disconnect event error', {
        error: error.message,
        stack: error.stack,
        socketId: socket.id
      });
    }
  });
}

module.exports = handleAudioCallEvents;
