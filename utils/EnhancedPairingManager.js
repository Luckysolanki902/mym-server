// utils/EnhancedPairingManager.js

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const PairingLogger = require('./PairingLogger');
const PairingQueue = require('./PairingQueue');
const AtomicLock = require('./atomicLock');
const { calculateFilterLevel, findBestMatch, getFilterDescription } = require('./matchingAlgorithm');

/**
 * Enhanced Pairing Manager with progressive filter matching
 * Implements Omegle-style queue-based pairing with wait time tracking
 */
class EnhancedPairingManager {
  constructor(io, usersMap, userRooms, pageType = 'textchat', options = {}) {
    this.io = io;
    this.usersMap = usersMap;
    this.userRooms = userRooms;
    this.pageType = pageType;
    this.options = options;
    
    // Initialize queue and lock
    this.queue = new PairingQueue();
    this.atomicLock = new AtomicLock();
    this.lock = this.atomicLock; // Alias for tests
    
    // State management
    this.isPairingRunning = false;
    this.isRunning = false; // Alias for tests
    this.processingInterval = null;
    
    // Configuration
    this.config = {
      processingIntervalMs: parseInt(process.env.QUEUE_PROCESSING_INTERVAL) || 1000,
      statusBroadcastIntervalMs: 1000, // Broadcast status every second
    };
    
    // Metrics
    this.metrics = {
      totalPairings: 0,
      successfulPairings: 0,
      failedAttempts: 0,
      level1Pairings: 0,
      level2Pairings: 0,
      level3Pairings: 0,
    };
    
    PairingLogger.pairing('EnhancedPairingManager initialized', {
      pageType: this.pageType,
      processingInterval: this.config.processingIntervalMs
    });
    
    // Start the pairing loop
    this.start();
  }

  /**
   * Start the pairing manager
   */
  start() {
    if (this.processingInterval) {
      PairingLogger.warn('Pairing manager already running', { pageType: this.pageType });
      return;
    }

    PairingLogger.pairing('Starting pairing manager', { pageType: this.pageType });
    
    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.processingIntervalMs);
  }

  /**
   * Stop the pairing manager
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      this.isRunning = false;
      if (!this.queue.isEmpty()) {
        this.queue.clear();
      }
      this.atomicLock.releaseAll();
      PairingLogger.pairing('Pairing manager stopped', { pageType: this.pageType });
    }
  }

  /**
   * Add a user to the queue
   * @returns {Object} - Result object with success, message, and data
   */
  addToQueue(userMID) {
    const isInvalidId =
      !userMID ||
      (typeof userMID === 'string' && userMID.trim().length === 0);

    if (isInvalidId) {
      PairingLogger.warn('Cannot add user to queue - invalid userMID', { userMID });
      return {
        success: false,
        message: 'Invalid user ID',
        data: { userMID }
      };
    }

    const user = this.usersMap.get(userMID);
    if (!user) {
      PairingLogger.error('Cannot add user to queue - user not found', { userMID });
      return {
        success: false,
        message: 'User not found',
        data: { userMID }
      };
    }

    // Update user state
    user.state = 'WAITING';
    user.queueJoinedAt = Date.now();
    user.currentFilterLevel = 1;
    user.pairingAttempts = 0;
    user.lastPairingAttempt = Date.now();

        // Add to enhanced pairing queue
    this.queue.enqueue(userMID, user.queueJoinedAt, 1);

    PairingLogger.queue('User added to queue', {
      userMID,
      queueStats: this.queue.getStats()
    });

    // Send queue acknowledgment immediately
    const queueEntry = this.queue.getEntry(userMID);
    if (queueEntry && user.socket && user.socket.connected) {
      const position = this.queue.getPosition(userMID);
      user.socket.emit('queueJoined', {
        success: true,
        position,
        queueSize: this.queue.size(),
        message: 'Successfully added to queue'
      });
      this.emitQueueStatus(user);
      PairingLogger.socket('Queue acknowledgment sent', { userMID, position });
    }

    return {
      success: true,
      message: 'User added to queue',
      data: {
        userMID,
        position: this.queue.size(),
        queueStats: this.queue.getStats()
      }
    };
  }

  /**
   * Remove a user from the queue
   * @returns {Object} - Result object with success, message, and data
   */
  removeFromQueue(userMID) {
    const removed = this.queue.remove(userMID);
    
    if (removed) {
      const user = this.usersMap.get(userMID);
      if (user) {
        user.state = 'IDLE';
      }

      this.atomicLock.releaseUser(userMID);
      
      PairingLogger.queue('User removed from queue', {
        userMID,
        remainingQueueSize: this.queue.size()
      });

      return {
        success: true,
        message: 'User removed from queue',
        data: {
          userMID,
          remainingQueueSize: this.queue.size()
        }
      };
    }

    return {
      success: false,
      message: 'User not found in queue',
      data: { userMID }
    };
  }

  /**
   * Main queue processing loop
   */
  async processQueue() {
    if (this.isPairingRunning) {
      return; // Already processing
    }

    if (this.queue.size() < 2) {
      // Not enough users to pair, but still broadcast status
      this.broadcastQueueStatus();
      return;
    }

    this.isPairingRunning = true;

    try {
      // Get all users in queue
      const queueEntries = this.queue.getAll();

      for (const entry of queueEntries) {
        const user = this.usersMap.get(entry.userMID);
        
        // Skip if user no longer exists or already paired
        if (!user || user.isPaired || user.state !== 'WAITING') {
          this.queue.remove(entry.userMID);
          continue;
        }

        // Validate socket connection before processing
        if (!user.socket || !user.socket.connected) {
          PairingLogger.warn('User socket disconnected during queue processing, removing', {
            userMID: user.userMID,
            hasSocket: !!user.socket,
            connected: user.socket?.connected
          });
          this.queue.remove(entry.userMID);
          this.usersMap.delete(entry.userMID);
          continue;
        }

        // Calculate current filter level based on wait time
        const waitTime = Date.now() - user.queueJoinedAt;
        const filterInfo = calculateFilterLevel(waitTime);

        // Handle level 5 (15 minute timeout - auto remove)
        if (filterInfo.level === 5 || filterInfo.shouldRemove) {
          this.handleMaxWaitTimeExceeded(user);
          this.queue.remove(entry.userMID);
          this.usersMap.delete(entry.userMID);
          continue;
        }

        // Update filter level if it changed
        if (filterInfo.level !== user.currentFilterLevel) {
          user.currentFilterLevel = filterInfo.level;
          this.queue.updateFilterLevel(user.userMID, filterInfo.level);

          // Notify user about filter level change
          user.socket.emit('filterLevelChanged', {
            oldLevel: user.currentFilterLevel - 1 || 1,
            newLevel: filterInfo.level,
            reason: 'timeout',
            newDescription: filterInfo.description
          });

          PairingLogger.queue('Filter level changed', {
            userMID: user.userMID,
            newLevel: filterInfo.level,
            waitTime: Math.floor(waitTime / 1000)
          });
        }

        // Broadcast queue status to user
        this.emitQueueStatus(user);

        // Handle level 4 (no match found - but keep waiting)
        if (filterInfo.level === 4) {
          this.handleNoUsersAvailable(user);
          // Don't continue - still try to find match at level 3
        }

        // Try to find a match (level 4 uses level 3 matching)
        const matchLevel = filterInfo.level === 4 ? 3 : filterInfo.level;
        await this.attemptPairing(user, matchLevel);
      }

    } catch (error) {
      PairingLogger.error('Error in queue processing', error);
    } finally {
      this.isPairingRunning = false;
    }
  }

  /**
   * Attempt to pair a user
   */
  async attemptPairing(user, filterLevel) {
    // Increment attempt counter
    user.pairingAttempts++;
    user.lastPairingAttempt = Date.now();
    this.queue.incrementAttempt(user.userMID);

    // Emit pairing attempt
    user.socket.emit('pairingAttempt', {
      attempt: user.pairingAttempts,
      filterLevel,
      searching: true,
      timestamp: Date.now()
    });

    // Find best match
  const lockedUsers = new Set(this.atomicLock.getLockedUsers());
  const match = findBestMatch(user, this.usersMap, filterLevel, lockedUsers);

    if (!match) {
      this.metrics.failedAttempts++;
      return; // No match found, will try again next cycle
    }

    // Try to acquire locks for both users
    if (!this.atomicLock.tryAcquire(user.userMID, match.user.userMID)) {
      PairingLogger.debug('Lock acquisition failed', {
        user1: user.userMID,
        user2: match.user.userMID
      });
      return;
    }

    try {
      // Pair the users
      await this.pairUsers(user, match.user, match);
    } catch (error) {
      PairingLogger.error('Error pairing users', error);
      this.metrics.failedAttempts++;
    } finally {
      // Always release locks
      this.atomicLock.release(user.userMID, match.user.userMID);
    }
  }

  /**
   * Pair two users together
   */
  async pairUsers(user1, user2, matchInfo) {
    // CRITICAL: Validate both sockets are connected before pairing
    if (!user1.socket || !user1.socket.connected) {
      PairingLogger.error('Cannot pair - user1 socket not connected', {
        user1: user1.userMID,
        hasSocket: !!user1.socket,
        connected: user1.socket?.connected
      });
      return;
    }
    
    if (!user2.socket || !user2.socket.connected) {
      PairingLogger.error('Cannot pair - user2 socket not connected', {
        user2: user2.userMID,
        hasSocket: !!user2.socket,
        connected: user2.socket?.connected
      });
      return;
    }
    
    // Create room
    const roomId = uuidv4();
    
    // Update metrics
    this.metrics.totalPairings++;
    this.metrics.successfulPairings++;
    
    if (matchInfo.filterLevel === 1) this.metrics.level1Pairings++;
    else if (matchInfo.filterLevel === 2) this.metrics.level2Pairings++;
    else if (matchInfo.filterLevel === 3) this.metrics.level3Pairings++;

    // Calculate wait times
    const user1WaitTime = Date.now() - user1.queueJoinedAt;
    const user2WaitTime = Date.now() - user2.queueJoinedAt;

    // Update user states
    user1.isPaired = true;
    user1.room = roomId;
    user1.pairedSocketId = user2.socket.id;
    user1.state = 'CHATTING';
    user1.matchScore = matchInfo.score;
    user1.preferencesMet = matchInfo.filterLevel === 1;

    user2.isPaired = true;
    user2.room = roomId;
    user2.pairedSocketId = user1.socket.id;
    user2.state = 'CHATTING';
    user2.matchScore = matchInfo.score;
    user2.preferencesMet = matchInfo.filterLevel === 1;

    // Remove from queue
    this.queue.remove(user1.userMID);
    this.queue.remove(user2.userMID);

    // Create room record
    this.userRooms.set(roomId, {
      user1,
      user2,
      createdAt: Date.now(),
      filterLevelMatched: matchInfo.filterLevel,
      matchScore: matchInfo.score,
      messageCount: 0
    });

    // Join socket rooms
    user1.socket.join(roomId);
    user2.socket.join(roomId);

    // Emit pairing success to both users with safety checks
    const pairingData1 = {
      room: roomId,
      strangerGender: user2.userGender,
      stranger: user2.userMID,
      isStrangerVerified: user2.isVerified,
      matchQuality: {
        filterLevel: matchInfo.filterLevel,
        score: matchInfo.score,
        preferencesMet: matchInfo.filterLevel === 1
      },
      waitTime: Math.floor(user1WaitTime / 1000)
    };

    const pairingData2 = {
      room: roomId,
      strangerGender: user1.userGender,
      stranger: user1.userMID,
      isStrangerVerified: user1.isVerified,
      matchQuality: {
        filterLevel: matchInfo.filterLevel,
        score: matchInfo.score,
        preferencesMet: matchInfo.filterLevel === 1
      },
      waitTime: Math.floor(user2WaitTime / 1000)
    };

    if (this.pageType === 'audiocall') {
      const rtcConfig = this.options.rtcConfig || {};
      const peerToken1 = this.generatePeerToken(roomId, user1.userMID);
      const peerToken2 = this.generatePeerToken(roomId, user2.userMID);
      const peerServer = this.options.peerServer || null;
      pairingData1.peer = { token: peerToken1, rtcConfig, server: peerServer };
      pairingData2.peer = { token: peerToken2, rtcConfig, server: peerServer };
      user1.peerToken = peerToken1;
      user2.peerToken = peerToken2;
      user1.callState = 'DIALING';
      user2.callState = 'DIALING';
    }

    // Emit with retry logic for race conditions
    const emitWithRetry = (user, data, userLabel) => {
      if (user.socket && user.socket.connected) {
        user.socket.emit('pairingSuccess', data);
        PairingLogger.socket(`Emitted pairingSuccess to ${userLabel}`, { 
          userMID: user.userMID, 
          socketId: user.socket.id,
          roomId 
        });
      } else {
  PairingLogger.warn(`${userLabel} socket not ready, retrying...`, { 
          userMID: user.userMID,
          hasSocket: !!user.socket,
          connected: user.socket?.connected 
        });
        
        // Retry after 100ms in case socket is in transition
        setTimeout(() => {
          if (user.socket && user.socket.connected) {
            user.socket.emit('pairingSuccess', data);
            PairingLogger.socket(`Retry successful: Emitted pairingSuccess to ${userLabel}`, { 
              userMID: user.userMID, 
              socketId: user.socket.id,
              roomId 
            });
          } else {
            PairingLogger.error(`${userLabel} socket still not connected after retry`, { 
              userMID: user.userMID,
              hasSocket: !!user.socket,
              connected: user.socket?.connected 
            });
          }
        }, 100);
      }
    };

    emitWithRetry(user1, pairingData1, 'user1');
    emitWithRetry(user2, pairingData2, 'user2');

    PairingLogger.pairing('Users successfully paired', {
      user1: user1.userMID,
      user2: user2.userMID,
      roomId,
      filterLevel: matchInfo.filterLevel,
      matchScore: matchInfo.score,
      user1WaitTime: Math.floor(user1WaitTime / 1000),
      user2WaitTime: Math.floor(user2WaitTime / 1000),
      reason: matchInfo.reason
    });
  }

  /**
   * Emit queue status to a user
   */
  emitQueueStatus(user) {
    const queueEntry = this.queue.getEntry(user.userMID);
    if (!queueEntry) return;

    const waitTime = Date.now() - user.queueJoinedAt;
    const filterInfo = calculateFilterLevel(waitTime);

    const status = {
      position: this.queue.getPosition(user.userMID),
      waitTime: Math.floor(waitTime / 1000),
      filterLevel: user.currentFilterLevel,
      estimatedWait: Math.floor(filterInfo.timeout / 1000),
      queueSize: this.queue.size(),
      filterDescription: filterInfo.description
    };

    user.socket.emit('queueStatus', status);
  }

  /**
   * Broadcast queue status to all waiting users
   */
  broadcastQueueStatus() {
    for (const [userMID, user] of this.usersMap.entries()) {
      if (user.state === 'WAITING' && !user.isPaired) {
        this.emitQueueStatus(user);
      }
    }
  }

  /**
   * Generate a cryptographically strong peer token so simultaneous pairings get unique identifiers
   */
  generatePeerToken(roomId, userMID) {
    const entropy = `${roomId || ''}-${userMID || ''}-${uuidv4()}-${Date.now()}`;
    const base64url = crypto.createHash('sha256').update(entropy).digest('base64url');
    // PeerJS allows alphanumeric plus a few safe symbols. Strip anything else just in case and cap length.
    return base64url.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 48);
  }

  /**
   * Handle no users available scenario (Level 4 - but keep waiting)
   */
  handleNoUsersAvailable(user) {
    if (user.socket && user.socket.connected) {
      user.socket.emit('noUsersAvailable', {
        waitTime: Math.floor((Date.now() - user.queueJoinedAt) / 1000),
        suggestion: 'Keep waiting - we\'ll pair you as soon as someone joins',
        keepWaiting: true,
        onlineUsers: {
          total: this.usersMap.size,
          inQueue: this.queue.size(),
          chatting: this.userRooms.size * 2
        }
      });
    }

    PairingLogger.queue('No users available - keep waiting', {
      userMID: user.userMID,
      waitTime: Math.floor((Date.now() - user.queueJoinedAt) / 1000),
      queueSize: this.queue.size()
    });
  }

  /**
   * Handle max wait time exceeded (15 minutes)
   */
  handleMaxWaitTimeExceeded(user) {
    const waitTime = Math.floor((Date.now() - user.queueJoinedAt) / 1000);
    
    if (user.socket && user.socket.connected) {
      user.socket.emit('queueTimeout', {
        waitTime,
        message: 'Maximum wait time exceeded (15 minutes)',
        suggestion: 'Please try again later when more users are online',
        onlineUsers: {
          total: this.usersMap.size,
          inQueue: this.queue.size(),
          chatting: this.userRooms.size * 2
        }
      });
    }

    PairingLogger.queue('Max wait time exceeded - removing user', {
      userMID: user.userMID,
      waitTime,
      maxWaitTime: 900 // 15 minutes in seconds
    });
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.size(),
      activeChats: this.userRooms.size,
      lockedUsers: this.atomicLock.getLockedCount(),
      queueStats: this.queue.getStats()
    };
  }

  /**
   * Log metrics
   */
  logMetrics() {
    const metrics = this.getMetrics();
    PairingLogger.metrics('Pairing manager metrics', metrics);
  }

  /**
   * Update user's filters while in queue
   * @param {string} userMID - User's socket ID
   * @param {Object} newFilters - New filter preferences
   * @param {string} newFilters.preferredGender - 'male' | 'female' | 'any'
   * @param {string} newFilters.preferredCollege - College name or 'any'
   * @returns {Object} - Result with success status and message
   */
  updateFiltersInQueue(userMID, newFilters) {
    try {
      // Check if user is in queue
      if (!this.queue.contains(userMID)) {
        return {
          success: false,
          message: 'User not in queue',
          data: null
        };
      }

      // Validate new filters
      const validGenders = ['male', 'female', 'any'];
      if (!validGenders.includes(newFilters.preferredGender)) {
        return {
          success: false,
          message: 'Invalid preferred gender',
          data: null
        };
      }

      // Get user from map
      const user = this.usersMap.get(userMID);
      if (!user) {
        return {
          success: false,
          message: 'User not found in map',
          data: null
        };
      }

      // Update filters in the user object
      user.preferredGender = newFilters.preferredGender;
      user.preferredCollege = newFilters.preferredCollege;

      // Reset user's filter level to 1 (start fresh with new filters)
      user.currentFilterLevel = 1;
      user.pairingAttempts = 0;

      // Update filters in queue (this will reset join time and priority)
      const updated = this.queue.updateUserFilters(userMID, newFilters);

      if (updated) {
        PairingLogger.success('Filters updated successfully', {
          userMID,
          newFilters,
          position: this.queue.getPosition(userMID),
          waitTime: this.queue.getWaitTime(userMID)
        });

        return {
          success: true,
          message: 'Filters updated successfully',
          data: {
            position: this.queue.getPosition(userMID),
            waitTime: this.queue.getWaitTime(userMID),
            newFilters
          }
        };
      }

      return {
        success: false,
        message: 'Failed to update filters in queue',
        data: null
      };
    } catch (error) {
      PairingLogger.error('Error updating filters in queue', {
        error: error.message,
        userMID
      });
      return {
        success: false,
        message: error.message,
        data: null
      };
    }
  }
}

module.exports = EnhancedPairingManager;
