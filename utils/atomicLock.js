// utils/atomicLock.js

const PairingLogger = require('./PairingLogger');

/**
 * Atomic lock mechanism to prevent race conditions during pairing
 * Ensures that a user can only be paired once at a time
 */
class AtomicLock {
  constructor() {
    this.locks = new Set();
    PairingLogger.debug('AtomicLock initialized', { initialSize: 0 });
  }

  /**
   * Try to acquire locks for both users atomically
   * @param {string} userMID1 - First user's ID
   * @param {string} userMID2 - Second user's ID
   * @returns {boolean} - True if both locks acquired, false otherwise
   */
  tryAcquire(userMID1, userMID2) {
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
    const hadLock1 = this.locks.has(userMID1);
    const hadLock2 = this.locks.has(userMID2);

    this.locks.delete(userMID1);
    this.locks.delete(userMID2);

    if (hadLock1 || hadLock2) {
      PairingLogger.debug('Locks released', {
        userMID1,
        userMID2,
        released1: hadLock1,
        released2: hadLock2,
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
    PairingLogger.warn('All locks force released', { previousCount: count });
  }

  /**
   * Get all locked user IDs as a Set (for matching algorithm)
   * @returns {Set<string>} - Set of locked user IDs
   */
  getLockedUsers() {
    return new Set(this.locks);
  }
}


module.exports = AtomicLock;
