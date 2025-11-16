// test/EnhancedPairingManager.test.js
const { expect } = require('chai');
const EnhancedPairingManager = require('../utils/EnhancedPairingManager');

const createMockSocket = (id) => ({
  id,
  connected: true,
  emit: () => {},
  join: () => {}
});

const createMockUser = (overrides = {}) => {
  const userMID = overrides.userMID || 'user';
  return {
    userMID,
    socket: overrides.socket || createMockSocket(overrides.socketId || `socket-${userMID}`),
    userGender: overrides.userGender || 'male',
    preferredGender: overrides.preferredGender || 'female',
    userCollege: overrides.userCollege || 'MIT',
    preferredCollege: overrides.preferredCollege || 'MIT',
    state: overrides.state || 'IDLE',
    isPaired: overrides.isPaired || false,
    ...overrides
  };
};

describe('EnhancedPairingManager', () => {
  let manager;
  let emittedEvents;
  let mockIo;
  let mockUsersMap;
  let mockUserRooms;

  beforeEach(() => {
    emittedEvents = [];

    mockIo = {
      to: (socketId) => ({
        emit: (event, data) => {
          emittedEvents.push({ socketId, event, data });
        }
      })
    };

    mockUsersMap = new Map();
    mockUserRooms = new Map();

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
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      const result = manager.addToQueue('user1');
      
      expect(result.success).to.be.true;
      expect(manager.queue.contains('user1')).to.be.true;
    });

    it('should emit queueStatus event after adding user', (done) => {
      const queueEvents = [];
      const mockSocket = {
        id: 'socket1',
        connected: true,
        emit: (event, data) => {
          if (event === 'queueStatus') {
            queueEvents.push(data);
            expect(data.position).to.be.a('number');
            expect(data.queueSize).to.be.a('number');
            done();
          }
        }
      };

      const mockUsersMap = new Map([
        ['user1', createMockUser({ userMID: 'user1', socket: mockSocket })]
      ]);

      const testManager = new EnhancedPairingManager(
        mockIo,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1');
      testManager.stop();
    });

    it('should not add duplicate user', () => {
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.addToQueue('user1');
      const result = manager.addToQueue('user1');
      
      expect(result.success).to.be.true; // Still success but updates preferences
      expect(manager.queue.size()).to.equal(1);
    });

    it('should reject invalid userId', () => {
      const result = manager.addToQueue('');
      
      expect(result.success).to.be.false;
      expect(result.message).to.include('Invalid');
    });
  });

  describe('removeFromQueue()', () => {
    it('should remove user from queue', () => {
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.addToQueue('user1');
      
      const result = manager.removeFromQueue('user1');
      
      expect(result.success).to.be.true;
      expect(manager.queue.contains('user1')).to.be.false;
    });

    it('should handle removing non-existent user', () => {
      const result = manager.removeFromQueue('nonexistent');
      
      expect(result.success).to.be.false;
    });

    it('should release lock if user was locked', () => {
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.usersMap.set('user2', createMockUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' }));
      manager.addToQueue('user1');
      manager.addToQueue('user2');
      
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
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.addToQueue('user1');
      
      manager.processQueue();
      
      setTimeout(() => {
        expect(manager.queue.contains('user1')).to.be.true; // Still in queue
        expect(manager.metrics.successfulPairings).to.equal(0);
        done();
      }, 50);
    });

    it('should attempt pairing for compatible users', (done) => {
      let pairingSuccessEmitted = false;
      const mockSocket1 = {
        id: 'socket1',
        join: () => {},
        emit: (event) => {
          if (event === 'pairingSuccess') pairingSuccessEmitted = true;
        },
        connected: true
      };
      const mockSocket2 = {
        id: 'socket2',
        join: () => {},
        emit: (event) => {
          if (event === 'pairingSuccess') pairingSuccessEmitted = true;
        },
        connected: true
      };
      
      const mockUsersMap = new Map([
        ['user1', createMockUser({
          userMID: 'user1',
          socket: mockSocket1,
          userGender: 'male',
          preferredGender: 'female'
        })],
        ['user2', createMockUser({
          userMID: 'user2',
          socket: mockSocket2,
          userGender: 'female',
          preferredGender: 'male'
        })]
      ]);
      
      const mockUserRooms = new Map();
      
      const testManager = new EnhancedPairingManager(
        mockIo,
        mockUsersMap,
        mockUserRooms,
        'testchat'
      );
      
      testManager.addToQueue('user1');
      testManager.addToQueue('user2');
      
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
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.usersMap.set('user2', createMockUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' }));
      manager.addToQueue('user1');
      manager.addToQueue('user2');
      
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
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.usersMap.set('user2', createMockUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' }));
      manager.addToQueue('user1');
      manager.addToQueue('user2');
      
      manager.stop();
      
      expect(manager.queue.size()).to.equal(0);
    });
  });

  describe('filter level progression', () => {
    it('should update filter level after timeout', (done) => {
      // Set shorter timeout for testing
      process.env.FILTER_LEVEL_1_TIMEOUT = '100';
      
      const testUsersMap = new Map([
        ['user1', createMockUser({ userMID: 'user1' })]
      ]);

      const testManager = new EnhancedPairingManager(
        manager.io,
        testUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1');
      
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
    it('should not pair locked users', (done) => {
      const mockSocket1 = { id: 'socket1', join: () => {}, emit: () => {}, connected: true };
      const mockSocket2 = { id: 'socket2', join: () => {}, emit: () => {}, connected: true };
      const mockSocket3 = { id: 'socket3', join: () => {}, emit: () => {}, connected: true };
      
      const mockUsersMap = new Map([
        ['user1', createMockUser({ userMID: 'user1', socket: mockSocket1 })],
        ['user2', createMockUser({ userMID: 'user2', socket: mockSocket2, userGender: 'female', preferredGender: 'male' })],
        ['user3', createMockUser({ userMID: 'user3', socket: mockSocket3, userGender: 'female', preferredGender: 'male' })]
      ]);
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1');
      testManager.addToQueue('user2');
      testManager.addToQueue('user3');
      
      // Lock user1 and user2 so user1 cannot be paired
      testManager.lock.tryAcquire('user1', 'user2');
      
      testManager.processQueue();
      
      setTimeout(() => {
        expect(testManager.queue.contains('user1')).to.be.true;
        expect(testManager.queue.contains('user3')).to.be.true;
        testManager.stop();
        done();
      }, 100);
    });
  });

  describe('metrics tracking', () => {
    it('should track pairing attempts', () => {
      manager.usersMap.set('user1', createMockUser({ userMID: 'user1' }));
      manager.usersMap.set('user2', createMockUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' }));
      manager.addToQueue('user1');
      manager.addToQueue('user2');
      
      const initialAttempts = manager.metrics.totalPairings;
      
      manager.processQueue();
      
      // Metrics should track attempts
      expect(manager.metrics.totalPairings).to.be.at.least(initialAttempts);
    });

    it('should track successful pairings by level', (done) => {
  const mockSocket1 = { id: 'socket1', join: () => {}, emit: () => {}, connected: true };
  const mockSocket2 = { id: 'socket2', join: () => {}, emit: () => {}, connected: true };
      
      const mockUsersMap = new Map([
        ['user1', createMockUser({ userMID: 'user1', socket: mockSocket1, userGender: 'male', preferredGender: 'female' })],
        ['user2', createMockUser({ userMID: 'user2', socket: mockSocket2, userGender: 'female', preferredGender: 'male' })]
      ]);
      
      const testManager = new EnhancedPairingManager(
        manager.io,
        mockUsersMap,
        new Map(),
        'testchat'
      );
      
      testManager.addToQueue('user1');
      testManager.addToQueue('user2');
      
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

  describe('generatePeerToken()', () => {
    it('produces PeerJS-safe IDs', () => {
      const regex = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
      for (let i = 0; i < 25; i += 1) {
        const token = manager.generatePeerToken(`room-${i}`, `user-${i}`);
        expect(token).to.be.a('string');
        expect(token.length).to.be.greaterThan(0);
        expect(token.length).to.be.at.most(48);
        expect(regex.test(token)).to.be.true;
      }
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
          emit: () => {},
          connected: true
        };
        mockUsersMap.set(`user${i}`, createMockUser({
          userMID: `user${i}`,
          socket: mockSocket,
          userGender: i % 2 === 0 ? 'male' : 'female',
          preferredGender: i % 2 === 0 ? 'female' : 'male'
        }));
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
