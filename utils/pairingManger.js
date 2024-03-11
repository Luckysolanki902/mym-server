const { pairUsers } = require('./pairingUtils');

function PairingManager(io, userQueue, usersMap, userRooms) {
  this.io = io;
  this.userQueue = userQueue;
  this.usersMap = usersMap;
  this.userRooms = userRooms;
  this.isPairingRunning = false;

  this.startPairing = () => {
    if (!this.isPairingRunning && this.userQueue.length >= 2) {
      this.isPairingRunning = true;
      pairUsers(this.userQueue, this.usersMap, this.io, this.userRooms);
      this.isPairingRunning = false;
    }
  };

  this.handleUserQueueChange = () => {
    this.startPairing();
  };

  // Listen for changes in the userQueue
  this.listenForQueueChanges = () => {
    setInterval(() => {
      if (this.userQueue.length > 0) {
        this.handleUserQueueChange();
      }
    }, 1000); // Adjust the interval as needed
  };

  this.listenForQueueChanges();
}

module.exports = PairingManager;
