// test/PairingLogger.test.js
const { expect } = require('chai');
const PairingLogger = require('../utils/PairingLogger');

const LEVEL_RANK = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

const createMockLogger = () => {
  const calls = [];
  const shouldLog = (level) => {
    const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
    const minRank = LEVEL_RANK[envLevel] || LEVEL_RANK.info;
    return LEVEL_RANK[level] >= minRank;
  };

  const push = (level, obj, msg) => {
    if (shouldLog(level)) {
      calls.push({ level, obj, message: msg });
    }
  };

  return {
    calls,
    logger: {
      info: (obj, msg) => push('info', obj, msg),
      warn: (obj, msg) => push('warn', obj, msg),
      error: (obj, msg) => push('error', obj, msg),
      debug: (obj, msg) => push('debug', obj, msg)
    }
  };
};

describe('PairingLogger', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    PairingLogger.setLogger(mockLogger.logger);
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    PairingLogger.resetLogger();
    delete process.env.LOG_LEVEL;
  });

  describe('queue()', () => {
    it('should log queue messages with correct category', () => {
      PairingLogger.queue('Test queue message', { userId: '123' });
      
      expect(mockLogger.calls.length).to.equal(1);
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('🔄 QUEUE');
      expect(log.message).to.equal('Test queue message');
      expect(log.obj.userId).to.equal('123');
    });

    it('should include additional metadata fields', () => {
      PairingLogger.queue('Test message', { position: 5, queueSize: 10 });
      const log = mockLogger.calls[0];
      expect(log.obj.position).to.equal(5);
      expect(log.obj.queueSize).to.equal(10);
    });
  });

  describe('pairing()', () => {
    it('should log pairing messages with correct category', () => {
      PairingLogger.pairing('Test pairing message', { user1: 'a', user2: 'b' });
      
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('🤝 PAIRING');
      expect(log.message).to.equal('Test pairing message');
      expect(log.obj.user1).to.equal('a');
    });
  });

  describe('socket()', () => {
    it('should log socket messages with correct category', () => {
      PairingLogger.socket('Socket event', { socketId: 'socket123' });
      
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('🔌 SOCKET');
      expect(log.message).to.equal('Socket event');
      expect(log.obj.socketId).to.equal('socket123');
    });
  });

  describe('error()', () => {
    it('should log errors with ERROR level', () => {
      PairingLogger.error('Test error', { error: 'Something went wrong' });
      
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('❌ ERROR');
      expect(log.message).to.equal('Test error');
      expect(log.obj.error).to.equal('Something went wrong');
    });
  });

  describe('metrics()', () => {
    it('should log metrics with correct category', () => {
      PairingLogger.metrics('Server metrics', { 
        queueSize: 5,
        activePairs: 10 
      });
      
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('📈 METRICS');
      expect(log.obj.queueSize).to.equal(5);
      expect(log.obj.activePairs).to.equal(10);
    });
  });

  describe('log levels', () => {
    it('should respect INFO level', () => {
      process.env.LOG_LEVEL = 'INFO';
      mockLogger = createMockLogger();
      PairingLogger.setLogger(mockLogger.logger);
      PairingLogger.queue('Info message');
      
      expect(mockLogger.calls.length).to.equal(1);
    });

    it('should filter out INFO when level is ERROR', () => {
      process.env.LOG_LEVEL = 'ERROR';
      mockLogger = createMockLogger();
      PairingLogger.setLogger(mockLogger.logger);
      PairingLogger.queue('Info message');
      
      expect(mockLogger.calls.length).to.equal(0);
    });

    it('should allow ERROR when level is ERROR', () => {
      process.env.LOG_LEVEL = 'ERROR';
      mockLogger = createMockLogger();
      PairingLogger.setLogger(mockLogger.logger);
      PairingLogger.error('Error message');
      
      expect(mockLogger.calls.length).to.equal(1);
    });
  });

  describe('data formatting', () => {
    it('should handle null data', () => {
      PairingLogger.queue('Message without data', null);
      
      const log = mockLogger.calls[0];
      expect(log.obj.category).to.equal('🔄 QUEUE');
    });

    it('should handle complex nested data', () => {
      const complexData = {
        user: { id: '123', name: 'Test' },
        preferences: { gender: 'female', college: 'MIT' }
      };
      
      PairingLogger.pairing('Complex data', complexData);
      
      const log = mockLogger.calls[0];
      expect(log.obj.user.id).to.equal('123');
      expect(log.obj.preferences.college).to.equal('MIT');
    });
  });
});
