// utils/PairingLogger.js

const pino = require('pino');

/**
 * Centralized logging system for the pairing service
 * Provides beautiful, structured, categorized logging with Pino
 */

// Configure Pino with pretty printing for development
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{category} | {msg}',
      customColors: 'queue:cyan,pairing:green,socket:blue,state:magenta,error:red,warning:yellow,debug:gray,metrics:white',
      customLevels: 'queue:30,pairing:30,socket:30,state:30,warning:40,metrics:30',
      singleLine: false,
      levelFirst: true,
      timestampKey: 'time'
    }
  }
});

/**
 * Centralized logging class with categorized methods
 */
class PairingLogger {
  /**
   * Queue-related logs
   */
  static queue(message, data = {}) {
    logger.info({ category: '🔄 QUEUE', ...data }, message);
  }

  /**
   * Pairing-related logs
   */
  static pairing(message, data = {}) {
    logger.info({ category: '🤝 PAIRING', ...data }, message);
  }

  /**
   * Socket-related logs
   */
  static socket(message, data = {}) {
    logger.info({ category: '🔌 SOCKET', ...data }, message);
  }

  /**
   * State-related logs
   */
  static state(message, data = {}) {
    logger.info({ category: '📊 STATE', ...data }, message);
  }

  /**
   * Error logs
   */
  static error(message, error = {}) {
    const errorData = error instanceof Error 
      ? { category: '❌ ERROR', error: error.message, stack: error.stack }
      : { category: '❌ ERROR', error: String(error) };
    logger.error(errorData, message);
  }

  /**
   * Warning logs
   */
  static warn(message, data = {}) {
    logger.warn({ category: '⚠️  WARNING', ...data }, message);
  }

  /**
   * Debug logs (only shown when LOG_LEVEL=debug)
   */
  static debug(message, data = {}) {
    logger.debug({ category: '🐛 DEBUG', ...data }, message);
  }

  /**
   * Performance/metrics logs
   */
  static metrics(message, data = {}) {
    logger.info({ category: '📈 METRICS', ...data }, message);
  }

  /**
   * Info logs (general information)
   */
  static info(message, data = {}) {
    logger.info({ category: 'ℹ️  INFO', ...data }, message);
  }

  /**
   * Success logs (for successful operations)
   */
  static success(message, data = {}) {
    logger.info({ category: '✅ SUCCESS', ...data }, message);
  }
}

module.exports = PairingLogger;
