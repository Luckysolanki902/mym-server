const { pairUsers } = require('./pairingUtils');

function PairingManager(io, userQueue, usersMap, userRooms) {
  this.io = io;
  this.userQueue = userQueue;
  this.usersMap = usersMap;
  this.userRooms = userRooms;
  this.isPairingRunning = false;

  this.startPairing = () => {
    if (!this.isPairingRunning && this.userQueue.length >= 2) {
      console.log('Starting pairing process...');
      this.isPairingRunning = true;
      pairUsers(this.userQueue, this.usersMap, this.io, this.userRooms);
      console.log('Pairing process complete.');
      this.isPairingRunning = false;
    } else {
      console.log('Pairing process already running or not enough users in the queue.');
    }
  };

  this.handleUserQueueChange = () => {
    console.log('User queue changed. Starting pairing process...');
    console.log('userQueue',userQueue)
    this.startPairing();
  };

  // Listen for changes in the userQueue
  this.listenForQueueChanges = () => {
    console.log('Listening for queue changes...');
    setInterval(() => {
      if (this.userQueue.length > 0) {
        console.log('Queue has users. Initiating handling...');
        this.handleUserQueueChange();
      }
    }, 1000); // Adjust the interval as needed
  };

  this.listenForQueueChanges();
}

module.exports = PairingManager;
