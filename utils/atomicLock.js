// utils/atomicLock.js

const PairingLogger = require('./PairingLogger');

/**
 * Atomic lock mechanism to prevent race conditions during pairing
 * Ensures that a user can only be paired once at a time
 */
class AtomicLock {
  constructor() {
    this.locks = new Set();
    this.lockPairs = new Map();
    PairingLogger.debug('AtomicLock initialized', { initialSize: 0 });
  }

  isValidUserId(userMID) {
    if (userMID === null || userMID === undefined) {
      return false;
    }

    if (typeof userMID === 'string' && userMID.trim().length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Try to acquire locks for both users atomically
   * @param {string} userMID1 - First user's ID
   * @param {string} userMID2 - Second user's ID
   * @returns {boolean} - True if both locks acquired, false otherwise
   */
  tryAcquire(userMID1, userMID2) {
    if (!this.isValidUserId(userMID1) || !this.isValidUserId(userMID2)) {
      PairingLogger.warn('Lock acquisition failed - invalid user IDs', {
        userMID1,
        userMID2
      });
      return false;
    }

    if (userMID1 === userMID2) {
      PairingLogger.warn('Lock acquisition failed - identical user IDs', {
        userMID1,
        userMID2
      });
      return false;
    }

    // Check if either user is already locked
    if (this.locks.has(userMID1) || this.locks.has(userMID2)) {
      PairingLogger.debug('Lock acquisition failed - already locked', {
        userMID1,
        userMID2,
        locked1: this.locks.has(userMID1),
        locked2: this.locks.has(userMID2)
      });
      return false;
    }

    // Acquire both locks atomically
    this.locks.add(userMID1);
    this.locks.add(userMID2);
    this.lockPairs.set(userMID1, userMID2);
    this.lockPairs.set(userMID2, userMID1);

    PairingLogger.debug('Locks acquired successfully', {
      userMID1,
      userMID2,
      totalLocks: this.locks.size
    });

    return true;
  }

  /**
   * Release locks for both users
   * @param {string} userMID1 - First user's ID
   * @param {string} userMID2 - Second user's ID
   */
  release(userMID1, userMID2) {
    const ids = [userMID1, userMID2].filter(id => this.isValidUserId(id));
    ids.forEach(id => this.releaseUser(id));
  }

  /**
   * Release lock for a single user (and its paired counterpart if present)
   * @param {*} userMID
   */
  releaseUser(userMID) {
    if (!this.isValidUserId(userMID)) {
      return;
    }

    const hadLock = this.locks.has(userMID);
    const partner = this.lockPairs.get(userMID);

    this.locks.delete(userMID);
    this.lockPairs.delete(userMID);

    if (partner !== undefined) {
      this.locks.delete(partner);
      this.lockPairs.delete(partner);
    }

    if (hadLock || partner !== undefined) {
      PairingLogger.debug('Lock released', {
        userMID,
        partner,
        remainingLocks: this.locks.size
      });
    }
  }

  /**
   * Check if a user is currently locked
   * @param {string} userMID - User's ID
   * @returns {boolean} - True if locked, false otherwise
   */
  isLocked(userMID) {
    return this.locks.has(userMID);
  }

  /**
   * Get count of currently locked users
   * @returns {number} - Number of locked users
   */
  getLockedCount() {
    return this.locks.size;
  }

  /**
   * Force release all locks (emergency cleanup)
   * Should only be used in error recovery scenarios
   */
  releaseAll() {
    const count = this.locks.size;
    this.locks.clear();
    this.lockPairs.clear();
    PairingLogger.warn('All locks force released', { previousCount: count });
  }

  /**
   * Get all locked user IDs as a Set (for matching algorithm)
   * @returns {Set<string>} - Set of locked user IDs
   */
  getLockedUsers() {
    return Array.from(this.locks);
  }
}


module.exports = AtomicLock;
