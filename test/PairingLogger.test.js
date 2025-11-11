// test/PairingLogger.test.js
const { expect } = require('chai');
const PairingLogger = require('../utils/PairingLogger');

describe('PairingLogger', () => {
  let originalConsoleLog;
  let consoleOutput = [];

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (message) => {
      consoleOutput.push(message);
    };
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
  });

  describe('queue()', () => {
    it('should log queue messages with correct category', () => {
      PairingLogger.queue('Test queue message', { userId: '123' });
      
      expect(consoleOutput.length).to.equal(1);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.category).to.equal('QUEUE');
      expect(log.message).to.equal('Test queue message');
      expect(log.data.userId).to.equal('123');
    });

    it('should include timestamp', () => {
      PairingLogger.queue('Test message');
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.timestamp).to.exist;
      expect(new Date(log.timestamp).getTime()).to.be.closeTo(Date.now(), 1000);
    });
  });

  describe('pairing()', () => {
    it('should log pairing messages with correct category', () => {
      PairingLogger.pairing('Test pairing message', { user1: 'a', user2: 'b' });
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.category).to.equal('PAIRING');
      expect(log.message).to.equal('Test pairing message');
      expect(log.data.user1).to.equal('a');
    });
  });

  describe('socket()', () => {
    it('should log socket messages with correct category', () => {
      PairingLogger.socket('Socket event', { socketId: 'socket123' });
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.category).to.equal('SOCKET');
      expect(log.message).to.equal('Socket event');
    });
  });

  describe('error()', () => {
    it('should log errors with ERROR level', () => {
      PairingLogger.error('Test error', { error: 'Something went wrong' });
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.category).to.equal('ERROR');
      expect(log.level).to.equal('ERROR');
      expect(log.message).to.equal('Test error');
    });
  });

  describe('metrics()', () => {
    it('should log metrics with correct category', () => {
      PairingLogger.metrics('Server metrics', { 
        queueSize: 5,
        activePairs: 10 
      });
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.category).to.equal('METRICS');
      expect(log.data.queueSize).to.equal(5);
      expect(log.data.activePairs).to.equal(10);
    });
  });

  describe('log levels', () => {
    it('should respect INFO level', () => {
      process.env.LOG_LEVEL = 'INFO';
      PairingLogger.queue('Info message');
      
      expect(consoleOutput.length).to.equal(1);
    });

    it('should filter out INFO when level is ERROR', () => {
      process.env.LOG_LEVEL = 'ERROR';
      PairingLogger.queue('Info message');
      
      expect(consoleOutput.length).to.equal(0);
    });

    it('should allow ERROR when level is ERROR', () => {
      process.env.LOG_LEVEL = 'ERROR';
      PairingLogger.error('Error message');
      
      expect(consoleOutput.length).to.equal(1);
    });
  });

  describe('data formatting', () => {
    it('should handle null data', () => {
      PairingLogger.queue('Message without data', null);
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.data).to.be.null;
    });

    it('should handle complex nested data', () => {
      const complexData = {
        user: { id: '123', name: 'Test' },
        preferences: { gender: 'female', college: 'MIT' }
      };
      
      PairingLogger.pairing('Complex data', complexData);
      
      const log = JSON.parse(consoleOutput[0]);
      expect(log.data.user.id).to.equal('123');
      expect(log.data.preferences.college).to.equal('MIT');
    });
  });
});
