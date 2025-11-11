// utils/matchingAlgorithm.js

const PairingLogger = require('./PairingLogger');

/**
 * Configuration for filter levels
 */
const FILTER_CONFIG = {
  LEVEL_1_TIMEOUT: parseInt(process.env.FILTER_LEVEL_1_TIMEOUT) || 15000,  // 15 seconds
  LEVEL_2_TIMEOUT: parseInt(process.env.FILTER_LEVEL_2_TIMEOUT) || 30000,  // 30 seconds
  LEVEL_3_TIMEOUT: parseInt(process.env.FILTER_LEVEL_3_TIMEOUT) || 45000,  // 45 seconds
  MAX_QUEUE_TIME: parseInt(process.env.MAX_QUEUE_TIME) || 900000,  // 15 minutes - auto remove after this
};

/**
 * Calculate filter level based on wait time
 * @param {number} waitTimeMs - Time waited in milliseconds
 * @returns {Object} - Filter level info
 */
function calculateFilterLevel(waitTimeMs) {
  // Check if exceeded max queue time (15 minutes)
  if (waitTimeMs >= FILTER_CONFIG.MAX_QUEUE_TIME) {
    return {
      level: 5,
      description: 'Maximum wait time exceeded',
      timeout: 0,
      nextLevel: null,
      shouldRemove: true
    };
  }
  
  if (waitTimeMs < FILTER_CONFIG.LEVEL_1_TIMEOUT) {
    return {
      level: 1,
      description: 'Searching in your college for preferred gender',
      timeout: FILTER_CONFIG.LEVEL_1_TIMEOUT - waitTimeMs,
      nextLevel: 2,
      shouldRemove: false
    };
  } else if (waitTimeMs < FILTER_CONFIG.LEVEL_2_TIMEOUT) {
    return {
      level: 2,
      description: 'Expanding search to all colleges',
      timeout: FILTER_CONFIG.LEVEL_2_TIMEOUT - waitTimeMs,
      nextLevel: 3,
      shouldRemove: false
    };
  } else if (waitTimeMs < FILTER_CONFIG.LEVEL_3_TIMEOUT) {
    return {
      level: 3,
      description: 'Searching for any available user',
      timeout: FILTER_CONFIG.LEVEL_3_TIMEOUT - waitTimeMs,
      nextLevel: 4,
      shouldRemove: false
    };
  } else {
    return {
      level: 4,
      description: 'No users available currently - Keep waiting',
      timeout: FILTER_CONFIG.MAX_QUEUE_TIME - waitTimeMs,
      nextLevel: 5,
      shouldRemove: false
    };
  }
}

/**
 * Match users based on filter level
 * @param {Object} user1 - First user
 * @param {Object} user2 - Second user
 * @param {number} filterLevel - Filter level to apply (1-4)
 * @returns {Object} - Match result with score and success flag
 */
function matchUsers(user1, user2, filterLevel) {
  // Can't match same user
  if (user1.userMID === user2.userMID) {
    return { success: false, score: 0, reason: 'Same user' };
  }

  // Can't match already paired users
  if (user1.isPaired || user2.isPaired) {
    return { success: false, score: 0, reason: 'Already paired' };
  }

  let score = 0;
  let checks = 0;
  let matches = 0;

  switch (filterLevel) {
    case 1: // Strict - both gender and college must match
      checks = 4;
      
      // Check user1's preferences against user2
      const user1GenderMatch = user1.preferredGender === 'any' || user1.preferredGender === user2.userGender;
      const user1CollegeMatch = user1.preferredCollege === 'any' || user1.preferredCollege === user2.userCollege;
      
      // Check user2's preferences against user1
      const user2GenderMatch = user2.preferredGender === 'any' || user2.preferredGender === user1.userGender;
      const user2CollegeMatch = user2.preferredCollege === 'any' || user2.preferredCollege === user1.userCollege;
      
      if (user1GenderMatch) { score += 25; matches++; }
      if (user1CollegeMatch) { score += 25; matches++; }
      if (user2GenderMatch) { score += 25; matches++; }
      if (user2CollegeMatch) { score += 25; matches++; }
      
      // All must match for level 1
      const success = matches === checks;
      
      PairingLogger.debug('Level 1 match attempt', {
        user1: user1.userMID,
        user2: user2.userMID,
        user1GenderMatch,
        user1CollegeMatch,
        user2GenderMatch,
        user2CollegeMatch,
        score,
        success
      });
      
      return {
        success,
        score: success ? score : 0,
        reason: success ? 'Perfect match (both filters)' : 'Preferences not met',
        filterLevel: 1
      };

    case 2: // Relaxed - gender only, any college
      checks = 2;
      
      const genderMatch1 = user1.preferredGender === 'any' || user1.preferredGender === user2.userGender;
      const genderMatch2 = user2.preferredGender === 'any' || user2.preferredGender === user1.userGender;
      
      if (genderMatch1) { score += 50; matches++; }
      if (genderMatch2) { score += 50; matches++; }
      
      // Both gender preferences must match
      const level2Success = matches === checks;
      
      PairingLogger.debug('Level 2 match attempt', {
        user1: user1.userMID,
        user2: user2.userMID,
        genderMatch1,
        genderMatch2,
        score,
        success: level2Success
      });
      
      return {
        success: level2Success,
        score: level2Success ? score : 0,
        reason: level2Success ? 'Good match (gender only)' : 'Gender preferences not met',
        filterLevel: 2
      };

    case 3: // Any user - just pair them
      PairingLogger.debug('Level 3 match attempt', {
        user1: user1.userMID,
        user2: user2.userMID,
        result: 'Match any user'
      });
      
      return {
        success: true,
        score: 50,
        reason: 'Any available user',
        filterLevel: 3
      };

    default:
      return {
        success: false,
        score: 0,
        reason: 'Invalid filter level',
        filterLevel
      };
  }
}

/**
 * Find the best match for a user from available users
 * @param {Object} user - User to match
 * @param {Map} usersMap - Map of all users
 * @param {number} filterLevel - Filter level to apply
 * @param {Set} excludeUserIds - User IDs to exclude from matching
 * @returns {Object|null} - Best match or null
 */
function findBestMatch(user, usersMap, filterLevel, excludeUserIds = new Set()) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [candidateId, candidateUser] of usersMap.entries()) {
    // Skip if same user, already paired, or in exclude set
    // CRITICAL: Also skip users in DISCONNECTED state (they haven't clicked Find New yet)
    if (
      candidateId === user.userMID ||
      candidateUser.isPaired ||
      excludeUserIds.has(candidateId) ||
      candidateUser.state !== 'WAITING' ||
      candidateUser.state === 'DISCONNECTED'
    ) {
      continue;
    }

    const matchResult = matchUsers(user, candidateUser, filterLevel);
    
    if (matchResult.success && matchResult.score > bestScore) {
      bestScore = matchResult.score;
      bestMatch = {
        user: candidateUser,
        score: matchResult.score,
        reason: matchResult.reason,
        filterLevel: matchResult.filterLevel
      };
    }
  }

  if (bestMatch) {
    PairingLogger.pairing('Best match found', {
      userMID: user.userMID,
      matchedWith: bestMatch.user.userMID,
      score: bestMatch.score,
      filterLevel,
      reason: bestMatch.reason
    });
  } else {
    PairingLogger.debug('No match found', {
      userMID: user.userMID,
      filterLevel,
      availableUsers: usersMap.size
    });
  }

  return bestMatch;
}

/**
 * Get filter level description for user display
 * @param {number} level - Filter level
 * @returns {string} - Description
 */
function getFilterDescription(level) {
  switch (level) {
    case 1:
      return 'Searching in your college for preferred gender';
    case 2:
      return 'Expanding search to all colleges';
    case 3:
      return 'Searching for any available user';
    case 4:
      return 'No users available currently';
    default:
      return 'Searching...';
  }
}

module.exports = {
  calculateFilterLevel,
  matchUsers,
  findBestMatch,
  getFilterDescription,
  FILTER_CONFIG
};
