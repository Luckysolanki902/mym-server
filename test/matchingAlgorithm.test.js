// test/matchingAlgorithm.test.js
const { expect } = require('chai');
const {
  calculateFilterLevel,
  matchUsers,
  findBestMatch
} = require('../utils/matchingAlgorithm');

describe('matchingAlgorithm', () => {
  describe('calculateFilterLevel()', () => {
    it('should return level 1 for wait time < 15s', () => {
      const result = calculateFilterLevel(10000);
      
      expect(result.level).to.equal(1);
      expect(result.description).to.include('your college');
      expect(result.nextLevel).to.equal(2);
    });

    it('should return level 2 for wait time between 15s and 30s', () => {
      const result = calculateFilterLevel(20000);
      
      expect(result.level).to.equal(2);
      expect(result.description).to.include('all colleges');
      expect(result.nextLevel).to.equal(3);
    });

    it('should return level 3 for wait time between 30s and 45s', () => {
      const result = calculateFilterLevel(35000);
      
      expect(result.level).to.equal(3);
      expect(result.description).to.include('anyone');
      expect(result.nextLevel).to.equal(4);
    });

    it('should return level 4 for wait time >= 45s', () => {
      const result = calculateFilterLevel(50000);
      
      expect(result.level).to.equal(4);
      expect(result.description).to.include('No match found');
      expect(result.nextLevel).to.be.null;
    });

    it('should calculate correct timeout remaining', () => {
      const result = calculateFilterLevel(10000);
      expect(result.timeout).to.equal(5000); // 15000 - 10000
    });
  });

  describe('matchUsers() - Level 1', () => {
    it('should match users with same college and compatible genders', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'MIT',
          preferredGender: 'male',
          preferredCollege: 'MIT'
        }
      };
      
      const result = matchUsers(user1, user2, 1);
      
      expect(result.success).to.be.true;
      expect(result.filterLevel).to.equal(1);
      expect(result.score).to.be.greaterThan(0);
    });

    it('should not match users from different colleges at level 1', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'Harvard',
          preferredGender: 'male',
          preferredCollege: 'Harvard'
        }
      };
      
      const result = matchUsers(user1, user2, 1);
      
      expect(result.success).to.be.false;
    });

    it('should not match incompatible genders at level 1', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const result = matchUsers(user1, user2, 1);
      
      expect(result.success).to.be.false;
    });

    it('should match when preferredCollege is "any"', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'any'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'MIT',
          preferredGender: 'male',
          preferredCollege: 'any'
        }
      };
      
      const result = matchUsers(user1, user2, 1);
      
      expect(result.success).to.be.true;
    });

    it('should give higher score for verified users', () => {
      const user1Verified = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT',
          isVerified: true
        }
      };
      
      const user1NotVerified = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT',
          isVerified: false
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'MIT',
          preferredGender: 'male',
          preferredCollege: 'MIT',
          isVerified: true
        }
      };
      
      const result1 = matchUsers(user1Verified, user2, 1);
      const result2 = matchUsers(user1NotVerified, user2, 1);
      
      expect(result1.score).to.be.greaterThan(result2.score);
    });
  });

  describe('matchUsers() - Level 2', () => {
    it('should match users with compatible genders from any college', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'Harvard',
          preferredGender: 'male',
          preferredCollege: 'Harvard'
        }
      };
      
      const result = matchUsers(user1, user2, 2);
      
      expect(result.success).to.be.true;
      expect(result.filterLevel).to.equal(2);
    });

    it('should not match incompatible genders at level 2', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'any'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'male',
          userCollege: 'Harvard',
          preferredGender: 'female',
          preferredCollege: 'any'
        }
      };
      
      const result = matchUsers(user1, user2, 2);
      
      expect(result.success).to.be.false;
    });

    it('should match when preferredGender is "any"', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'any',
          preferredCollege: 'any'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'male',
          userCollege: 'Harvard',
          preferredGender: 'any',
          preferredCollege: 'any'
        }
      };
      
      const result = matchUsers(user1, user2, 2);
      
      expect(result.success).to.be.true;
    });
  });

  describe('matchUsers() - Level 3', () => {
    it('should match any two users', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {
          userGender: 'male',
          userCollege: 'Harvard',
          preferredGender: 'female',
          preferredCollege: 'Harvard'
        }
      };
      
      const result = matchUsers(user1, user2, 3);
      
      expect(result.success).to.be.true;
      expect(result.filterLevel).to.equal(3);
    });

    it('should give higher score for gender match at level 3', () => {
      const user1 = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const user2Match = {
        userId: 'user2',
        preferences: {
          userGender: 'female',
          userCollege: 'Harvard',
          preferredGender: 'male',
          preferredCollege: 'Harvard'
        }
      };
      
      const user2NoMatch = {
        userId: 'user3',
        preferences: {
          userGender: 'male',
          userCollege: 'Stanford',
          preferredGender: 'male',
          preferredCollege: 'Stanford'
        }
      };
      
      const result1 = matchUsers(user1, user2Match, 3);
      const result2 = matchUsers(user1, user2NoMatch, 3);
      
      expect(result1.score).to.be.greaterThan(result2.score);
    });
  });

  describe('findBestMatch()', () => {
    it('should find best match from candidates', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT',
          isVerified: true
        }
      };
      
      const candidates = [
        {
          userId: 'user2',
          preferences: {
            userGender: 'female',
            userCollege: 'MIT',
            preferredGender: 'male',
            preferredCollege: 'MIT',
            isVerified: false
          }
        },
        {
          userId: 'user3',
          preferences: {
            userGender: 'female',
            userCollege: 'MIT',
            preferredGender: 'male',
            preferredCollege: 'MIT',
            isVerified: true
          }
        }
      ];
      
      const result = findBestMatch(user, candidates, 1);
      
      expect(result.success).to.be.true;
      expect(result.matchedUser.userId).to.equal('user3'); // Higher score due to verification
    });

    it('should return no match when no candidates available', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const result = findBestMatch(user, [], 1);
      
      expect(result.success).to.be.false;
      expect(result.matchedUser).to.be.null;
    });

    it('should return no match when no compatible candidates at level 1', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const candidates = [
        {
          userId: 'user2',
          preferences: {
            userGender: 'male',
            userCollege: 'MIT',
            preferredGender: 'female',
            preferredCollege: 'MIT'
          }
        }
      ];
      
      const result = findBestMatch(user, candidates, 1);
      
      expect(result.success).to.be.false;
    });

    it('should find match at level 3 even with incompatible preferences', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const candidates = [
        {
          userId: 'user2',
          preferences: {
            userGender: 'male',
            userCollege: 'Harvard',
            preferredGender: 'female',
            preferredCollege: 'Harvard'
          }
        }
      ];
      
      const result = findBestMatch(user, candidates, 3);
      
      expect(result.success).to.be.true;
      expect(result.matchedUser.userId).to.equal('user2');
    });

    it('should select highest scoring match', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const candidates = [
        {
          userId: 'user2',
          preferences: {
            userGender: 'female',
            userCollege: 'Harvard', // Different college
            preferredGender: 'male',
            preferredCollege: 'any'
          }
        },
        {
          userId: 'user3',
          preferences: {
            userGender: 'female',
            userCollege: 'MIT', // Same college
            preferredGender: 'male',
            preferredCollege: 'MIT'
          }
        }
      ];
      
      const result = findBestMatch(user, candidates, 1);
      
      expect(result.success).to.be.true;
      expect(result.matchedUser.userId).to.equal('user3'); // Better match
    });
  });

  describe('edge cases', () => {
    it('should handle missing preferences gracefully', () => {
      const user1 = {
        userId: 'user1',
        preferences: {}
      };
      
      const user2 = {
        userId: 'user2',
        preferences: {}
      };
      
      const result = matchUsers(user1, user2, 3);
      
      expect(result.success).to.be.true; // Level 3 matches anyone
    });

    it('should handle null preferences', () => {
      const user1 = {
        userId: 'user1',
        preferences: null
      };
      
      const user2 = {
        userId: 'user2',
        preferences: null
      };
      
      expect(() => matchUsers(user1, user2, 3)).to.not.throw();
    });

    it('should not match user with themselves', () => {
      const user = {
        userId: 'user1',
        preferences: {
          userGender: 'male',
          userCollege: 'MIT',
          preferredGender: 'female',
          preferredCollege: 'MIT'
        }
      };
      
      const result = matchUsers(user, user, 1);
      
      expect(result.success).to.be.false;
    });
  });
});
