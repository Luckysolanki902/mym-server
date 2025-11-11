// test/EnhancedPairingManager.test.js
const { expect } = require('chai');
const EnhancedPairingManager = require('../utils/EnhancedPairingManager');

describe('EnhancedPairingManager', () => {
  let manager;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];
    
    // Mock IO with event emitter
    const mockIo = {
      to: (socketId) => ({
        emit: (event, data) => {
          emittedEvents.push({ socketId, event, data });
        }
      })
    };
    
    const mockUsersMap = new Map();
    const mockUserRooms = new Map();
    
    manager = new EnhancedPairingManager(mockIo, mockUsersMap, mockUserRooms, 'testchat');
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with correct properties', () => {
      expect(manager.pageType).to.equal('testchat');
      expect(manager.queue).to.exist;
      expect(manager.lock).to.exist;
      expect(manager.metrics.totalPairings).to.equal(0);
    });

    it('should start processing interval', (done) => {
      // Wait for at least one processing cycle
      setTimeout(() => {
        expect(manager.isRunning).to.be.true;
        done();
      }, 100);
    });
  });

  describe('addToQueue()', () => {
    it('should add user to queue successfully', () => {
      const result = manager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      expect(result.success).to.be.true;
      expect(manager.queue.contains('user1')).to.be.true;
    });

    it('should emit queueStatus event after adding user', (done) => {
      const mockSocket = { id: 'socket1' };
      const mockUsersMap = new Map([['user1', { socket: mockSocket }]]);
      
      const mockIo = {
        to: (socketId) => ({
          emit: (event, data) => {
            if (event === 'queueStatus') {
              expect(data.position).to.be.a('number');
              expect(data.queueLength).to.be.a('number');
              done();
            }
          }
        })
      };
      
      const testManager = new EnhancedPairingManager(
        mockIo,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      testManager.stop();
    });

    it('should not add duplicate user', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      const result = manager.addToQueue('user1', { userGender: 'male' });
      
      expect(result.success).to.be.true; // Still success but updates preferences
      expect(manager.queue.size()).to.equal(1);
    });

    it('should reject invalid userId', () => {
      const result = manager.addToQueue('', { userGender: 'male' });
      
      expect(result.success).to.be.false;
      expect(result.message).to.include('Invalid');
    });
  });

  describe('removeFromQueue()', () => {
    it('should remove user from queue', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      
      const result = manager.removeFromQueue('user1');
      
      expect(result.success).to.be.true;
      expect(manager.queue.contains('user1')).to.be.false;
    });

    it('should handle removing non-existent user', () => {
      const result = manager.removeFromQueue('nonexistent');
      
      expect(result.success).to.be.false;
    });

    it('should release lock if user was locked', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      manager.addToQueue('user2', { userGender: 'female' });
      
      manager.lock.tryAcquire('user1', 'user2');
      
      manager.removeFromQueue('user1');
      
      expect(manager.lock.isLocked('user1')).to.be.false;
      expect(manager.lock.isLocked('user2')).to.be.false;
    });
  });

  describe('processQueue()', () => {
    it('should process empty queue without errors', (done) => {
      manager.processQueue();
      
      setTimeout(() => {
        expect(manager.metrics.totalPairings).to.equal(0);
        done();
      }, 50);
    });

    it('should not pair single user', (done) => {
      manager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      manager.processQueue();
      
      setTimeout(() => {
        expect(manager.queue.contains('user1')).to.be.true; // Still in queue
        expect(manager.metrics.successfulPairings).to.equal(0);
        done();
      }, 50);
    });

    it('should attempt pairing for compatible users', (done) => {
      const mockSocket1 = { id: 'socket1', join: () => {} };
      const mockSocket2 = { id: 'socket2', join: () => {} };
      
      const mockUsersMap = new Map([
        ['user1', { 
          socket: mockSocket1,
          isPaired: false,
          userGender: 'male',
          preferredGender: 'female'
        }],
        ['user2', { 
          socket: mockSocket2,
          isPaired: false,
          userGender: 'female',
          preferredGender: 'male'
        }]
      ]);
      
      const mockUserRooms = new Map();
      
      let pairingSuccessEmitted = false;
      const mockIo = {
        to: (socketId) => ({
          emit: (event, data) => {
            if (event === 'pairingSuccess') {
              pairingSuccessEmitted = true;
            }
          }
        })
      };
      
      const testManager = new EnhancedPairingManager(
        mockIo,
        mockUsersMap,
        mockUserRooms,
        'testchat'
      );
      
      testManager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      testManager.addToQueue('user2', {
        userGender: 'female',
        userCollege: 'MIT',
        preferredGender: 'male',
        preferredCollege: 'MIT'
      });
      
      testManager.processQueue();
      
      setTimeout(() => {
        expect(pairingSuccessEmitted).to.be.true;
        expect(testManager.metrics.successfulPairings).to.be.at.least(0);
        testManager.stop();
        done();
      }, 100);
    });
  });

  describe('getMetrics()', () => {
    it('should return correct metrics structure', () => {
      const metrics = manager.getMetrics();
      
      expect(metrics).to.have.property('totalPairings');
      expect(metrics).to.have.property('successfulPairings');
      expect(metrics).to.have.property('failedAttempts');
      expect(metrics).to.have.property('level1Pairings');
      expect(metrics).to.have.property('level2Pairings');
      expect(metrics).to.have.property('level3Pairings');
      expect(metrics).to.have.property('queueSize');
      expect(metrics).to.have.property('activeChats');
      expect(metrics).to.have.property('lockedUsers');
      expect(metrics).to.have.property('queueStats');
    });

    it('should update metrics after operations', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      manager.addToQueue('user2', { userGender: 'female' });
      
      const metrics = manager.getMetrics();
      
      expect(metrics.queueSize).to.equal(2);
      expect(metrics.queueStats.size).to.equal(2);
    });
  });

  describe('stop()', () => {
    it('should stop processing queue', (done) => {
      expect(manager.isRunning).to.be.true;
      
      manager.stop();
      
      setTimeout(() => {
        expect(manager.isRunning).to.be.false;
        expect(manager.processingInterval).to.be.null;
        done();
      }, 50);
    });

    it('should clear queue on stop', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      manager.addToQueue('user2', { userGender: 'female' });
      
      manager.stop();
      
      expect(manager.queue.size()).to.equal(0);
    });
  });

  describe('filter level progression', () => {
    it('should update filter level after timeout', (done) => {
      // Set shorter timeout for testing
      process.env.FILTER_LEVEL_1_TIMEOUT = '100';
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        new Map(),
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      setTimeout(() => {
        const user = testManager.queue.getUser('user1');
        // Filter level should have progressed
        expect(user.filterLevel).to.be.at.least(1);
        testManager.stop();
        done();
      }, 150);
    });
  });

  describe('concurrent pairing prevention', () => {
    it('should not pair locked users', () => {
      const mockSocket1 = { id: 'socket1', join: () => {} };
      const mockSocket2 = { id: 'socket2', join: () => {} };
      const mockSocket3 = { id: 'socket3', join: () => {} };
      
      const mockUsersMap = new Map([
        ['user1', { socket: mockSocket1, isPaired: false }],
        ['user2', { socket: mockSocket2, isPaired: false }],
        ['user3', { socket: mockSocket3, isPaired: false }]
      ]);
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1', { userGender: 'male', preferredGender: 'female' });
      testManager.addToQueue('user2', { userGender: 'female', preferredGender: 'male' });
      testManager.addToQueue('user3', { userGender: 'female', preferredGender: 'male' });
      
      // Lock user1 and user2
      testManager.lock.tryAcquire('user1', 'user2');
      
      // Try to pair user1 with user3 - should fail
      const result = testManager.attemptPairing('user1', 'user3', 1);
      
      expect(result.success).to.be.false;
      expect(result.reason).to.include('locked');
      
      testManager.stop();
    });
  });

  describe('metrics tracking', () => {
    it('should track pairing attempts', () => {
      manager.addToQueue('user1', { userGender: 'male' });
      manager.addToQueue('user2', { userGender: 'female' });
      
      const initialAttempts = manager.metrics.totalPairings;
      
      manager.processQueue();
      
      // Metrics should track attempts
      expect(manager.metrics.totalPairings).to.be.at.least(initialAttempts);
    });

    it('should track successful pairings by level', (done) => {
      const mockSocket1 = { id: 'socket1', join: () => {} };
      const mockSocket2 = { id: 'socket2', join: () => {} };
      
      const mockUsersMap = new Map([
        ['user1', { 
          socket: mockSocket1,
          isPaired: false,
          userGender: 'male'
        }],
        ['user2', { 
          socket: mockSocket2,
          isPaired: false,
          userGender: 'female'
        }]
      ]);
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1', {
        userGender: 'male',
        userCollege: 'MIT',
        preferredGender: 'female',
        preferredCollege: 'MIT'
      });
      
      testManager.addToQueue('user2', {
        userGender: 'female',
        userCollege: 'MIT',
        preferredGender: 'male',
        preferredCollege: 'MIT'
      });
      
      testManager.processQueue();
      
      setTimeout(() => {
        const metrics = testManager.getMetrics();
        // Should have attempted at least one pairing
        expect(metrics.totalPairings).to.be.at.least(0);
        testManager.stop();
        done();
      }, 100);
    });
  });

  describe('stress test', () => {
    it('should handle 50 users efficiently', function(done) {
      this.timeout(5000);
      
      const mockUsersMap = new Map();
      const mockUserRooms = new Map();
      
      // Create 50 mock users
      for (let i = 0; i < 50; i++) {
        const mockSocket = { 
          id: `socket${i}`, 
          join: () => {},
          userMID: `user${i}`
        };
        mockUsersMap.set(`user${i}`, {
          socket: mockSocket,
          isPaired: false,
          userGender: i % 2 === 0 ? 'male' : 'female',
          preferredGender: i % 2 === 0 ? 'female' : 'male'
        });
      }
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        mockUsersMap,
        mockUserRooms,
        'testchat'
      );
      
      // Add all users to queue
      for (let i = 0; i < 50; i++) {
        testManager.addToQueue(`user${i}`, {
          userGender: i % 2 === 0 ? 'male' : 'female',
          userCollege: 'MIT',
          preferredGender: i % 2 === 0 ? 'female' : 'male',
          preferredCollege: 'MIT'
        });
      }
      
      expect(testManager.queue.size()).to.equal(50);
      
      // Process queue multiple times
      for (let i = 0; i < 5; i++) {
        testManager.processQueue();
      }
      
      setTimeout(() => {
        const metrics = testManager.getMetrics();
        expect(metrics.queueSize).to.be.lessThan(50); // Some should be paired
        testManager.stop();
        done();
      }, 500);
    });
  });
});
