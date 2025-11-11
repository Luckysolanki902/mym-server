// test/atomicLock.test.js
const { expect } = require('chai');
const AtomicLock = require('../utils/atomicLock');

describe('AtomicLock', () => {
  let lock;

  beforeEach(() => {
    lock = new AtomicLock();
  });

  describe('tryAcquire()', () => {
    it('should successfully acquire lock for two users', () => {
      const result = lock.tryAcquire('user1', 'user2');
      
      expect(result).to.be.true;
      expect(lock.isLocked('user1')).to.be.true;
      expect(lock.isLocked('user2')).to.be.true;
    });

    it('should fail if first user is already locked', () => {
      lock.tryAcquire('user1', 'user2');
      const result = lock.tryAcquire('user1', 'user3');
      
      expect(result).to.be.false;
      expect(lock.isLocked('user3')).to.be.false;
    });

    it('should fail if second user is already locked', () => {
      lock.tryAcquire('user1', 'user2');
      const result = lock.tryAcquire('user3', 'user2');
      
      expect(result).to.be.false;
      expect(lock.isLocked('user3')).to.be.false;
    });

    it('should fail if both users are already locked', () => {
      lock.tryAcquire('user1', 'user2');
      const result = lock.tryAcquire('user1', 'user2');
      
      expect(result).to.be.false;
    });

    it('should prevent race condition - same user paired twice', () => {
      const result1 = lock.tryAcquire('user1', 'user2');
      const result2 = lock.tryAcquire('user1', 'user3');
      
      expect(result1).to.be.true;
      expect(result2).to.be.false;
    });

    it('should handle same user for both parameters', () => {
      const result = lock.tryAcquire('user1', 'user1');
      
      // Should fail because you can't pair a user with themselves
      expect(result).to.be.false;
    });
  });

  describe('release()', () => {
    it('should release lock for both users', () => {
      lock.tryAcquire('user1', 'user2');
      lock.release('user1', 'user2');
      
      expect(lock.isLocked('user1')).to.be.false;
      expect(lock.isLocked('user2')).to.be.false;
    });

    it('should allow re-locking after release', () => {
      lock.tryAcquire('user1', 'user2');
      lock.release('user1', 'user2');
      
      const result = lock.tryAcquire('user1', 'user3');
      expect(result).to.be.true;
    });

    it('should handle releasing already unlocked users', () => {
      // Should not throw error
      expect(() => lock.release('user1', 'user2')).to.not.throw();
      
      expect(lock.isLocked('user1')).to.be.false;
      expect(lock.isLocked('user2')).to.be.false;
    });
  });

  describe('isLocked()', () => {
    it('should return false for unlocked user', () => {
      expect(lock.isLocked('user1')).to.be.false;
    });

    it('should return true for locked user', () => {
      lock.tryAcquire('user1', 'user2');
      expect(lock.isLocked('user1')).to.be.true;
    });

    it('should return false after release', () => {
      lock.tryAcquire('user1', 'user2');
      lock.release('user1', 'user2');
      expect(lock.isLocked('user1')).to.be.false;
    });
  });

  describe('getLockedUsers()', () => {
    it('should return empty array when no users locked', () => {
      expect(lock.getLockedUsers()).to.deep.equal([]);
    });

    it('should return all locked users', () => {
      lock.tryAcquire('user1', 'user2');
      lock.tryAcquire('user3', 'user4');
      
      const locked = lock.getLockedUsers();
      expect(locked).to.have.lengthOf(4);
      expect(locked).to.include('user1');
      expect(locked).to.include('user2');
      expect(locked).to.include('user3');
      expect(locked).to.include('user4');
    });
  });

  describe('concurrent operations simulation', () => {
    it('should handle 100 concurrent lock attempts correctly', () => {
      const users = Array.from({ length: 100 }, (_, i) => `user${i}`);
      const results = [];
      
      // Try to pair users sequentially (simulating concurrent requests)
      for (let i = 0; i < users.length - 1; i += 2) {
        results.push(lock.tryAcquire(users[i], users[i + 1]));
      }
      
      // All should succeed because they're different pairs
      expect(results.every(r => r === true)).to.be.true;
      expect(lock.getLockedUsers().length).to.equal(100);
    });

    it('should prevent any user from being locked twice', () => {
      lock.tryAcquire('user1', 'user2');
      
      const attempts = [
        lock.tryAcquire('user1', 'user3'),
        lock.tryAcquire('user4', 'user1'),
        lock.tryAcquire('user2', 'user5'),
        lock.tryAcquire('user6', 'user2'),
      ];
      
      // All should fail because user1 and user2 are locked
      expect(attempts.every(r => r === false)).to.be.true;
    });
  });

  describe('edge cases', () => {
    it('should handle empty string userIds', () => {
      const result = lock.tryAcquire('', '');
      expect(result).to.be.false;
    });

    it('should handle null userIds gracefully', () => {
      const result = lock.tryAcquire(null, 'user2');
      expect(result).to.be.false;
    });

    it('should handle undefined userIds gracefully', () => {
      const result = lock.tryAcquire(undefined, 'user2');
      expect(result).to.be.false;
    });

    it('should treat different data types as different users', () => {
      const result1 = lock.tryAcquire('123', '456');
      const result2 = lock.tryAcquire(123, 456);
      
      expect(result1).to.be.true;
      expect(result2).to.be.true; // Different types, different users
    });
  });
});
