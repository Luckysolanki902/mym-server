// utils/PairingQueue.js

const PairingLogger = require('./PairingLogger');

/**
 * Priority queue for managing users waiting to be paired
 * Users are sorted by wait time and filter level
 */
class PairingQueue {
  constructor() {
    this.queue = [];
    PairingLogger.debug('PairingQueue initialized', { size: 0 });
  }

  /**
   * Add a user to the queue
   * @param {string} userMID - User's unique identifier
   * @param {number} joinedAt - Timestamp when user joined (milliseconds)
   * @param {number} filterLevel - Current filter level (1-4)
   */
  enqueue(userMID, joinedAt, filterLevel = 1) {
    // Check if user already in queue
    const existingIndex = this.queue.findIndex(entry => entry.userMID === userMID);
    if (existingIndex !== -1) {
      PairingLogger.warn('User already in queue, updating entry', { userMID });
      this.queue.splice(existingIndex, 1);
    }

    const entry = {
      userMID,
      joinedAt,
      filterLevel,
      lastAttempt: Date.now(),
      attempts: 0,
      priority: this.calculatePriority(joinedAt, filterLevel)
    };

    this.queue.push(entry);
    this.sortQueue();

    PairingLogger.queue('User added to queue', {
      userMID,
      position: this.getPosition(userMID),
      queueSize: this.queue.length,
      filterLevel,
      priority: entry.priority
    });
  }

  /**
   * Calculate priority score for a user
   * Higher score = higher priority (processed first)
   * @param {number} joinedAt - When user joined queue
   * @param {number} filterLevel - Current filter level
   * @returns {number} - Priority score
   */
  calculatePriority(joinedAt, filterLevel) {
    const waitTime = Date.now() - joinedAt;
    const filterWeight = filterLevel * 1000; // Higher level = higher priority
    return waitTime + filterWeight;
  }

  /**
   * Sort queue by priority (highest first)
   */
  sortQueue() {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove and return the highest priority user
   * @returns {Object|null} - Queue entry or null if empty
   */
  dequeue() {
    if (this.queue.length === 0) {
      return null;
    }
    
    const entry = this.queue.shift();
    PairingLogger.debug('User dequeued', {
      userMID: entry.userMID,
      waitTime: Date.now() - entry.joinedAt,
      remainingQueueSize: this.queue.length
    });
    
    return entry;
  }

  /**
   * Update a user's filter level and recalculate priority
   * @param {string} userMID - User's ID
   * @param {number} newLevel - New filter level
   */
  updateFilterLevel(userMID, newLevel) {
    const entry = this.queue.find(e => e.userMID === userMID);
    if (entry) {
      const oldLevel = entry.filterLevel;
      entry.filterLevel = newLevel;
      entry.priority = this.calculatePriority(entry.joinedAt, newLevel);
      this.sortQueue();

      PairingLogger.queue('Filter level updated', {
        userMID,
        oldLevel,
        newLevel,
        newPriority: entry.priority,
        position: this.getPosition(userMID)
      });
    }
  }

  /**
   * Increment pairing attempt counter for a user
   * @param {string} userMID - User's ID
   */
  incrementAttempt(userMID) {
    const entry = this.queue.find(e => e.userMID === userMID);
    if (entry) {
      entry.attempts++;
      entry.lastAttempt = Date.now();
    }
  }

  /**
   * Remove a user from the queue
   * @param {string} userMID - User's ID
   * @returns {boolean} - True if removed, false if not found
   */
  remove(userMID) {
    const index = this.queue.findIndex(e => e.userMID === userMID);
    if (index !== -1) {
      const entry = this.queue[index];
      this.queue.splice(index, 1);
      
      PairingLogger.queue('User removed from queue', {
        userMID,
        waitTime: Date.now() - entry.joinedAt,
        attempts: entry.attempts,
        remainingQueueSize: this.queue.length
      });
      
      return true;
    }
    
    PairingLogger.debug('User not found in queue for removal', { userMID });
    return false;
  }

  /**
   * Get a user's position in the queue (1-based)
   * @param {string} userMID - User's ID
   * @returns {number} - Position (1-based) or -1 if not found
   */
  getPosition(userMID) {
    const index = this.queue.findIndex(e => e.userMID === userMID);
    return index !== -1 ? index + 1 : -1;
  }

  /**
   * Get queue entry for a user
   * @param {string} userMID - User's ID
   * @returns {Object|null} - Queue entry or null if not found
   */
  getEntry(userMID) {
    return this.queue.find(e => e.userMID === userMID) || null;
  }

  /**
   * Check if user is in queue
   * @param {string} userMID - User's ID
   * @returns {boolean} - True if user is in queue
   */
  contains(userMID) {
    return this.queue.some(e => e.userMID === userMID);
  }

  /**
   * Get user object from queue
   * @param {string} userMID - User's ID
   * @returns {Object|null} - User queue entry or null
   */
  getUser(userMID) {
    return this.getEntry(userMID);
  }

  /**
   * Get all users in queue
   * @returns {Array} - Array of user IDs
   */
  getAllUsers() {
    return this.queue.map(e => e.userMID);
  }

  /**
   * Increment pairing attempts for a user
   * @param {string} userMID - User's ID
   * @returns {number} - New attempt count or -1 if not found
   */
  incrementPairingAttempts(userMID) {
    const entry = this.queue.find(e => e.userMID === userMID);
    if (entry) {
      entry.attempts++;
      entry.lastAttempt = Date.now();
      return entry.attempts;
    }
    return -1;
  }

  /**
   * Get wait time for a user in seconds
   * @param {string} userMID - User's ID
   * @returns {number} - Wait time in seconds or -1 if not found
   */
  getWaitTime(userMID) {
    const entry = this.queue.find(e => e.userMID === userMID);
    if (entry) {
      return Math.floor((Date.now() - entry.joinedAt) / 1000);
    }
    return -1;
  }

  /**
   * Get current queue size
   * @returns {number} - Number of users in queue
   */
  size() {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   * @returns {boolean} - True if empty
   */
  isEmpty() {
    return this.queue.length === 0;
  }

  /**
   * Get all queue entries (for processing)
   * @returns {Array} - Copy of queue array
   */
  getAll() {
    return [...this.queue];
  }

  /**
   * Clear the entire queue
   */
  clear() {
    const size = this.queue.length;
    this.queue = [];
    PairingLogger.warn('Queue cleared', { previousSize: size });
  }

  /**
   * Get queue statistics
   * @returns {Object} - Queue statistics
   */
  getStats() {
    if (this.queue.length === 0) {
      return {
        size: 0,
        avgWaitTime: 0,
        maxWaitTime: 0,
        avgAttempts: 0
      };
    }

    const now = Date.now();
    const waitTimes = this.queue.map(e => now - e.joinedAt);
    const attempts = this.queue.map(e => e.attempts);

    return {
      size: this.queue.length,
      avgWaitTime: Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length / 1000),
      maxWaitTime: Math.round(Math.max(...waitTimes) / 1000),
      avgAttempts: Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length * 10) / 10
    };
  }

  /**
   * Update a user's filters while they're in the queue
   * @param {string} userMID - User's ID
   * @param {Object} newFilters - New filter preferences
   * @param {string} newFilters.preferredGender - 'male' | 'female' | 'any'
   * @param {string} newFilters.preferredCollege - College name or 'any'
   * @returns {boolean} - Success status
   */
  updateUserFilters(userMID, newFilters) {
    const entry = this.queue.find(e => e.userMID === userMID);
    if (!entry) {
      PairingLogger.warn('Cannot update filters - user not in queue', { userMID });
      return false;
    }

    PairingLogger.queue('Updating user filters in queue', {
      userMID,
      oldFilters: {
        gender: entry.preferredGender,
        college: entry.preferredCollege
      },
      newFilters
    });

    // Store old values for logging
    entry.previousPreferredGender = entry.preferredGender;
    entry.previousPreferredCollege = entry.preferredCollege;

    // Update filters
    entry.preferredGender = newFilters.preferredGender;
    entry.preferredCollege = newFilters.preferredCollege;

    // Reset pairing attempts to give fair chance with new filters
    entry.attempts = 0;

    // Reset join time to current time (restart wait time with new filters)
    entry.joinedAt = Date.now();

    // Recalculate priority with new join time and reset filter level to 1
    entry.filterLevel = 1;
    entry.priority = this.calculatePriority(entry.joinedAt, 1);

    // Re-sort queue to maintain priority order
    this.sortQueue();

    PairingLogger.success('User filters updated in queue', {
      userMID,
      newFilters,
      newPosition: this.getPosition(userMID),
      resetAttempts: true
    });

    return true;
  }
}

module.exports = PairingQueue;
