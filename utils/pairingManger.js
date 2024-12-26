// utils/PairingManager.js

const { pairUsers } = require('./pairingUtils');

/**
 * Helper function to add timestamps to logs.
 * @param {string} level - The log level ('info', 'warn', 'error').
 * @param {string} message - The log message.
 */
const log = (level, message) => {
  const timestamp = new Date().toISOString();
  switch (level) {
    case 'info':
      console.info(`[${timestamp}] INFO: ${message}`);
      break;
    case 'warn':
      console.warn(`[${timestamp}] WARN: ${message}`);
      break;
    case 'error':
      console.error(`[${timestamp}] ERROR: ${message}`);
      break;
    default:
      console.log(`[${timestamp}] ${message}`);
  }
};

/**
 * PairingManager handles the pairing of users based on the queue.
 * @param {object} io - The Socket.IO server instance.
 * @param {Array} userQueue - The queue of users waiting to be paired.
 * @param {Map} usersMap - A map of user IDs to user data.
 * @param {Map} userRooms - A map of room IDs to room data.
 */
function PairingManager(io, userQueue, usersMap, userRooms) {
  this.io = io;
  this.userQueue = userQueue;
  this.usersMap = usersMap;
  this.userRooms = userRooms;
  this.isPairingRunning = false;

  /**
   * Initiates the pairing process if not already running and enough users are present.
   */
  this.startPairing = () => {
    if (!this.isPairingRunning && this.userQueue.length >= 2) {
      log('info', 'PairingManager: Starting pairing process.');
      this.isPairingRunning = true;
      try {
        pairUsers(this.userQueue, this.usersMap, this.io, this.userRooms);
        log('info', 'PairingManager: Pairing process completed successfully.');
      } catch (error) {
        log('error', `PairingManager: Error during pairing process - ${error.message}`);
      } finally {
        this.isPairingRunning = false;
      }
    } else if (this.isPairingRunning) {
      log('warn', 'PairingManager: Pairing process is already running.');
    } else {
      log('info', `PairingManager: Not enough users to pair. Current queue length: ${this.userQueue.length}`);
    }
  };

  /**
   * Handles changes in the user queue by attempting to start pairing.
   */
  this.handleUserQueueChange = () => {
    log('info', 'PairingManager: Handling user queue change.');
    this.startPairing();
  };

  /**
   * Continuously listens for changes in the user queue at regular intervals.
   */
  this.listenForQueueChanges = () => {
    log('info', 'PairingManager: Starting to listen for queue changes.');
    setInterval(() => {
      if (this.userQueue.length > 0) {
        log('info', `PairingManager: Queue change detected. Current queue length: ${this.userQueue.length}`);
        this.handleUserQueueChange();
      }
    }, 1000); // Adjust the interval as needed
  };

  // Initialize the listener
  this.listenForQueueChanges();
}

module.exports = PairingManager;
