// test/PairingQueue.test.js
const { expect } = require('chai');
const PairingQueue = require('../utils/PairingQueue');

describe('PairingQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new PairingQueue();
  });

  describe('enqueue()', () => {
    it('should add user to queue', () => {
      queue.enqueue('user1', { gender: 'male', college: 'MIT' });
      
      expect(queue.size()).to.equal(1);
      expect(queue.contains('user1')).to.be.true;
    });

    it('should not add duplicate users', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user1', { gender: 'male' });
      
      expect(queue.size()).to.equal(1);
    });

    it('should update preferences for existing user', () => {
      queue.enqueue('user1', { gender: 'male', college: 'MIT' });
      queue.enqueue('user1', { gender: 'female', college: 'Harvard' });
      
      const user = queue.getUser('user1');
      expect(user.preferences.gender).to.equal('female');
      expect(user.preferences.college).to.equal('Harvard');
    });

    it('should initialize wait time and attempts', () => {
      queue.enqueue('user1', { gender: 'male' });
      
      const user = queue.getUser('user1');
      expect(user.joinTime).to.be.a('number');
      expect(user.pairingAttempts).to.equal(0);
      expect(user.filterLevel).to.equal(1);
    });
  });

  describe('dequeue()', () => {
    it('should return null when queue is empty', () => {
      const user = queue.dequeue();
      expect(user).to.be.null;
    });

    it('should remove and return user from queue', () => {
      queue.enqueue('user1', { gender: 'male' });
      
      const user = queue.dequeue();
      expect(user.userId).to.equal('user1');
      expect(queue.size()).to.equal(0);
    });

    it('should dequeue based on priority (wait time)', (done) => {
      queue.enqueue('user1', { gender: 'male' });
      
      setTimeout(() => {
        queue.enqueue('user2', { gender: 'female' });
        
        const first = queue.dequeue();
        expect(first.userId).to.equal('user1'); // user1 waited longer
        
        done();
      }, 10);
    });

    it('should dequeue based on filter level priority', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      
      // Manually increase filter level for user2
      queue.updateFilterLevel('user2', 2);
      
      const first = queue.dequeue();
      expect(first.userId).to.equal('user2'); // Higher filter level = higher priority
    });
  });

  describe('remove()', () => {
    it('should remove specific user from queue', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      
      const removed = queue.remove('user1');
      expect(removed).to.be.true;
      expect(queue.size()).to.equal(1);
      expect(queue.contains('user1')).to.be.false;
    });

    it('should return false for non-existent user', () => {
      const removed = queue.remove('nonexistent');
      expect(removed).to.be.false;
    });
  });

  describe('contains()', () => {
    it('should return true for user in queue', () => {
      queue.enqueue('user1', { gender: 'male' });
      expect(queue.contains('user1')).to.be.true;
    });

    it('should return false for user not in queue', () => {
      expect(queue.contains('user1')).to.be.false;
    });
  });

  describe('getUser()', () => {
    it('should return user data', () => {
      queue.enqueue('user1', { gender: 'male', college: 'MIT' });
      
      const user = queue.getUser('user1');
      expect(user.userId).to.equal('user1');
      expect(user.preferences.gender).to.equal('male');
      expect(user.preferences.college).to.equal('MIT');
    });

    it('should return null for non-existent user', () => {
      const user = queue.getUser('nonexistent');
      expect(user).to.be.null;
    });
  });

  describe('getPosition()', () => {
    it('should return correct position in queue', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      queue.enqueue('user3', { gender: 'male' });
      
      expect(queue.getPosition('user1')).to.equal(1);
      expect(queue.getPosition('user2')).to.equal(2);
      expect(queue.getPosition('user3')).to.equal(3);
    });

    it('should return -1 for non-existent user', () => {
      expect(queue.getPosition('nonexistent')).to.equal(-1);
    });

    it('should update positions after dequeue', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      
      queue.dequeue();
      expect(queue.getPosition('user2')).to.equal(1);
    });
  });

  describe('getAllUsers()', () => {
    it('should return all users in priority order', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      queue.enqueue('user3', { gender: 'male' });
      
      const users = queue.getAllUsers();
      expect(users).to.have.lengthOf(3);
      expect(users[0].userId).to.equal('user1');
    });

    it('should return empty array when queue is empty', () => {
      const users = queue.getAllUsers();
      expect(users).to.be.an('array').that.is.empty;
    });
  });

  describe('incrementPairingAttempts()', () => {
    it('should increment pairing attempts for user', () => {
      queue.enqueue('user1', { gender: 'male' });
      
      queue.incrementPairingAttempts('user1');
      const user = queue.getUser('user1');
      expect(user.pairingAttempts).to.equal(1);
      
      queue.incrementPairingAttempts('user1');
      expect(queue.getUser('user1').pairingAttempts).to.equal(2);
    });

    it('should do nothing for non-existent user', () => {
      expect(() => queue.incrementPairingAttempts('nonexistent')).to.not.throw();
    });
  });

  describe('updateFilterLevel()', () => {
    it('should update filter level for user', () => {
      queue.enqueue('user1', { gender: 'male' });
      
      queue.updateFilterLevel('user1', 2);
      const user = queue.getUser('user1');
      expect(user.filterLevel).to.equal(2);
    });

    it('should update priority when filter level changes', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      
      queue.updateFilterLevel('user2', 3);
      
      const first = queue.dequeue();
      expect(first.userId).to.equal('user2'); // Higher filter level
    });

    it('should do nothing for non-existent user', () => {
      expect(() => queue.updateFilterLevel('nonexistent', 2)).to.not.throw();
    });
  });

  describe('getWaitTime()', () => {
    it('should return correct wait time', (done) => {
      queue.enqueue('user1', { gender: 'male' });
      
      setTimeout(() => {
        const waitTime = queue.getWaitTime('user1');
        expect(waitTime).to.be.at.least(50);
        expect(waitTime).to.be.at.most(100);
        done();
      }, 50);
    });

    it('should return 0 for non-existent user', () => {
      const waitTime = queue.getWaitTime('nonexistent');
      expect(waitTime).to.equal(0);
    });
  });

  describe('getStats()', () => {
    it('should return correct statistics', (done) => {
      queue.enqueue('user1', { gender: 'male' });
      
      setTimeout(() => {
        queue.enqueue('user2', { gender: 'female' });
        queue.enqueue('user3', { gender: 'male' });
        
        queue.incrementPairingAttempts('user1');
        queue.incrementPairingAttempts('user1');
        queue.incrementPairingAttempts('user2');
        
        const stats = queue.getStats();
        expect(stats.size).to.equal(3);
        expect(stats.avgWaitTime).to.be.at.least(10);
        expect(stats.maxWaitTime).to.be.at.least(50);
        expect(stats.avgAttempts).to.be.closeTo(1, 0.5);
        
        done();
      }, 50);
    });

    it('should return zeros for empty queue', () => {
      const stats = queue.getStats();
      expect(stats.size).to.equal(0);
      expect(stats.avgWaitTime).to.equal(0);
      expect(stats.maxWaitTime).to.equal(0);
      expect(stats.avgAttempts).to.equal(0);
    });
  });

  describe('size() and isEmpty()', () => {
    it('should return correct size', () => {
      expect(queue.size()).to.equal(0);
      
      queue.enqueue('user1', { gender: 'male' });
      expect(queue.size()).to.equal(1);
      
      queue.enqueue('user2', { gender: 'female' });
      expect(queue.size()).to.equal(2);
    });

    it('should correctly report empty state', () => {
      expect(queue.isEmpty()).to.be.true;
      
      queue.enqueue('user1', { gender: 'male' });
      expect(queue.isEmpty()).to.be.false;
      
      queue.dequeue();
      expect(queue.isEmpty()).to.be.true;
    });
  });

  describe('priority ordering', () => {
    it('should prioritize by filter level then wait time', (done) => {
      // Add users with delays
      queue.enqueue('user1', { gender: 'male' });
      
      setTimeout(() => {
        queue.enqueue('user2', { gender: 'female' });
        
        // user2 has higher filter level
        queue.updateFilterLevel('user2', 2);
        
        const first = queue.dequeue();
        expect(first.userId).to.equal('user2'); // Higher filter level wins
        
        const second = queue.dequeue();
        expect(second.userId).to.equal('user1');
        
        done();
      }, 10);
    });

    it('should prioritize by wait time when filter levels are equal', (done) => {
      queue.enqueue('user1', { gender: 'male' });
      
      setTimeout(() => {
        queue.enqueue('user2', { gender: 'female' });
        
        const first = queue.dequeue();
        expect(first.userId).to.equal('user1'); // Waited longer
        
        done();
      }, 10);
    });
  });

  describe('clear()', () => {
    it('should remove all users from queue', () => {
      queue.enqueue('user1', { gender: 'male' });
      queue.enqueue('user2', { gender: 'female' });
      queue.enqueue('user3', { gender: 'male' });
      
      queue.clear();
      
      expect(queue.size()).to.equal(0);
      expect(queue.isEmpty()).to.be.true;
    });
  });

  describe('stress test', () => {
    it('should handle 1000 users efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        queue.enqueue(`user${i}`, { 
          gender: i % 2 === 0 ? 'male' : 'female',
          college: `College${i % 10}`
        });
      }
      
      const enqueueTime = Date.now() - startTime;
      expect(enqueueTime).to.be.lessThan(1000); // Should be fast
      expect(queue.size()).to.equal(1000);
      
      // Dequeue all
      const dequeueStart = Date.now();
      let count = 0;
      while (!queue.isEmpty()) {
        queue.dequeue();
        count++;
      }
      const dequeueTime = Date.now() - dequeueStart;
      
      expect(count).to.equal(1000);
      expect(dequeueTime).to.be.lessThan(2000);
      expect(queue.isEmpty()).to.be.true;
    });
  });
});
