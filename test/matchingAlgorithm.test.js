// test/matchingAlgorithm.test.js
const { expect } = require('chai');
const {
  calculateFilterLevel,
  matchUsers,
  findBestMatch
} = require('../utils/matchingAlgorithm');

const createUser = (overrides = {}) => ({
  userMID: overrides.userMID || `user-${Math.random().toString(36).slice(2)}`,
  userGender: overrides.userGender || 'male',
  preferredGender: overrides.preferredGender || 'female',
  userCollege: overrides.userCollege || 'MIT',
  preferredCollege: overrides.preferredCollege || 'MIT',
  isPaired: overrides.isPaired ?? false,
  state: overrides.state || 'WAITING',
  isVerified: overrides.isVerified ?? false,
  ...overrides
});

describe('matchingAlgorithm', () => {
  describe('calculateFilterLevel()', () => {
    it('returns level 1 for wait time < 15s', () => {
      const result = calculateFilterLevel(10000);

      expect(result.level).to.equal(1);
      expect(result.description).to.include('your college');
      expect(result.nextLevel).to.equal(2);
    });

    it('returns level 2 for wait time between 15s and 30s', () => {
      const result = calculateFilterLevel(20000);

      expect(result.level).to.equal(2);
      expect(result.description).to.include('all colleges');
      expect(result.nextLevel).to.equal(3);
    });

    it('returns level 3 for wait time between 30s and 45s', () => {
      const result = calculateFilterLevel(35000);

      expect(result.level).to.equal(3);
      expect(result.description).to.include('available user');
      expect(result.nextLevel).to.equal(4);
    });

    it('returns level 4 for wait time >= 45s', () => {
      const result = calculateFilterLevel(50000);

      expect(result.level).to.equal(4);
      expect(result.description).to.include('No users available currently');
      expect(result.nextLevel).to.equal(5);
    });

    it('flags users that exceed max wait time (level 5)', () => {
      const result = calculateFilterLevel(900000);

      expect(result.level).to.equal(5);
      expect(result.shouldRemove).to.be.true;
      expect(result.nextLevel).to.be.null;
    });

    it('calculates timeout remaining', () => {
      const result = calculateFilterLevel(10000);
      expect(result.timeout).to.equal(5000);
    });
  });

  describe('matchUsers()', () => {
    it('matches users with same college and compatible genders at level 1', () => {
      const user1 = createUser({ userMID: 'user1' });
      const user2 = createUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' });

      const result = matchUsers(user1, user2, 1);

      expect(result.success).to.be.true;
      expect(result.score).to.equal(100);
    });

    it('rejects users from different colleges at level 1', () => {
      const user1 = createUser({ userMID: 'user1', userCollege: 'MIT' });
      const user2 = createUser({ userMID: 'user2', userCollege: 'Harvard', preferredCollege: 'Harvard', userGender: 'female', preferredGender: 'male' });

      const result = matchUsers(user1, user2, 1);
      expect(result.success).to.be.false;
    });

    it('rejects incompatible genders at level 1', () => {
      const user1 = createUser({ userMID: 'user1', preferredGender: 'female' });
      const user2 = createUser({ userMID: 'user2', userGender: 'male', preferredGender: 'female' });

      const result = matchUsers(user1, user2, 1);
      expect(result.success).to.be.false;
    });

    it('respects preferredCollege="any" at level 1', () => {
      const user1 = createUser({ userMID: 'user1', preferredCollege: 'any' });
      const user2 = createUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male', preferredCollege: 'any' });

      const result = matchUsers(user1, user2, 1);
      expect(result.success).to.be.true;
    });

    it('matches compatible genders from different colleges at level 2', () => {
      const user1 = createUser({ userMID: 'user1', preferredCollege: 'any' });
      const user2 = createUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male', userCollege: 'Harvard', preferredCollege: 'any' });

      const result = matchUsers(user1, user2, 2);
      expect(result.success).to.be.true;
      expect(result.score).to.equal(100);
    });

    it('fails level 2 match when gender preferences conflict', () => {
      const user1 = createUser({ userMID: 'user1', preferredGender: 'female' });
      const user2 = createUser({ userMID: 'user2', userGender: 'male', preferredGender: 'female' });

      const result = matchUsers(user1, user2, 2);
      expect(result.success).to.be.false;
    });

    it('matches any two users at level 3', () => {
      const user1 = createUser({ userMID: 'user1' });
      const user2 = createUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' });

      const result = matchUsers(user1, user2, 3);
      expect(result.success).to.be.true;
      expect(result.score).to.equal(50);
      expect(result.reason).to.equal('Any available user');
    });

    it('does not match the same user with themselves', () => {
      const user = createUser({ userMID: 'user1' });
      const result = matchUsers(user, user, 1);
      expect(result.success).to.be.false;
    });

    it('does not match users already paired', () => {
      const user1 = createUser({ userMID: 'user1', isPaired: true });
      const user2 = createUser({ userMID: 'user2', userGender: 'female', preferredGender: 'male' });

      const result = matchUsers(user1, user2, 1);
      expect(result.success).to.be.false;
    });
  });

  describe('findBestMatch()', () => {
    it('returns the highest scoring candidate', () => {
      const seeker = createUser({ userMID: 'seeker', preferredCollege: 'MIT' });
      const candidateA = createUser({ userMID: 'candidateA', userGender: 'female', preferredGender: 'male', userCollege: 'Harvard', preferredCollege: 'any' });
      const candidateB = createUser({ userMID: 'candidateB', userGender: 'female', preferredGender: 'male', userCollege: 'MIT', preferredCollege: 'MIT' });

      const usersMap = new Map([
        [candidateA.userMID, candidateA],
        [candidateB.userMID, candidateB]
      ]);

      const match = findBestMatch(seeker, usersMap, 1, new Set());

      expect(match).to.exist;
      expect(match.user.userMID).to.equal('candidateB');
      expect(match.score).to.equal(100);
    });

    it('returns null when no candidates available', () => {
      const seeker = createUser({ userMID: 'seeker' });
      const match = findBestMatch(seeker, new Map(), 1, new Set());
      expect(match).to.be.null;
    });

    it('skips users that are paired or disconnected', () => {
      const seeker = createUser({ userMID: 'seeker' });
      const pairedUser = createUser({ userMID: 'paired', isPaired: true });
      const disconnectedUser = createUser({ userMID: 'disc', state: 'DISCONNECTED' });

      const usersMap = new Map([
        [pairedUser.userMID, pairedUser],
        [disconnectedUser.userMID, disconnectedUser]
      ]);

      const match = findBestMatch(seeker, usersMap, 1, new Set());
      expect(match).to.be.null;
    });

    it('respects excluded user IDs', () => {
      const seeker = createUser({ userMID: 'seeker' });
      const candidate = createUser({ userMID: 'candidate', userGender: 'female', preferredGender: 'male' });

      const usersMap = new Map([[candidate.userMID, candidate]]);
      const excluded = new Set([candidate.userMID]);

      const match = findBestMatch(seeker, usersMap, 1, excluded);
      expect(match).to.be.null;
    });

    it('can find matches at higher filter levels when strict matches fail', () => {
      const seeker = createUser({ userMID: 'seeker', preferredCollege: 'MIT' });
      const candidate = createUser({ userMID: 'candidate', userGender: 'female', preferredGender: 'male', userCollege: 'Harvard', preferredCollege: 'any' });

      const usersMap = new Map([[candidate.userMID, candidate]]);

      const level1Match = findBestMatch(seeker, usersMap, 1, new Set());
      expect(level1Match).to.be.null;

      const level3Match = findBestMatch(seeker, usersMap, 3, new Set());
      expect(level3Match).to.exist;
      expect(level3Match.user.userMID).to.equal('candidate');
      expect(level3Match.filterLevel).to.equal(3);
    });
  });

  describe('edge cases', () => {
    it('handles missing preferred filters at level 3', () => {
      const user1 = { userMID: 'user1', userGender: 'male', state: 'WAITING' };
      const user2 = { userMID: 'user2', userGender: 'female', state: 'WAITING' };

      const result = matchUsers(user1, user2, 3);
      expect(result.success).to.be.true;
    });

    it('does not throw when optional fields are undefined', () => {
      const user1 = { userMID: 'user1' };
      const user2 = { userMID: 'user2' };

      expect(() => matchUsers(user1, user2, 3)).to.not.throw();
    });
  });
});
