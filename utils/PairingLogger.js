// utils/PairingLogger.js

const pino = require('pino');
const fs = require('fs');
const path = require('path');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOGS_DIR = path.join(__dirname, '..', 'logs');

try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (error) {
  console.warn('[PairingLogger] Unable to create logs directory', error?.message || error);
}

/**
 * Centralized logging system for the pairing service
 * Provides beautiful, structured, categorized logging with Pino
 */

// Configure Pino with pretty printing for development
const createDefaultLogger = () => {
  const prettyTransport = pino.transport({
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
  });

  const fileDestination = pino.destination({
    dest: path.join(LOGS_DIR, 'server.log'),
    mkdir: true
  });

  const errorDestination = pino.destination({
    dest: path.join(LOGS_DIR, 'server-error.log'),
    mkdir: true
  });

  return pino(
    {
      level: LOG_LEVEL,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime
    },
    pino.multistream([
      { level: LOG_LEVEL, stream: prettyTransport },
      { level: 'info', stream: fileDestination },
      { level: 'error', stream: errorDestination }
    ])
  );
};

let logger = createDefaultLogger();

const normalizeData = (data) => {
  if (!data || typeof data !== 'object') {
    return {};
  }
  return data;
};

/**
 * Centralized logging class with categorized methods
 */
class PairingLogger {
  /**
   * Queue-related logs
   */
  static queue(message, data = {}) {
    logger.info({ category: '🔄 QUEUE', ...normalizeData(data) }, message);
  }

  /**
   * Pairing-related logs
   */
  static pairing(message, data = {}) {
    logger.info({ category: '🤝 PAIRING', ...normalizeData(data) }, message);
  }

  /**
   * Socket-related logs
   */
  static socket(message, data = {}) {
    logger.info({ category: '🔌 SOCKET', ...normalizeData(data) }, message);
  }

  /**
   * PeerJS-related logs
   */
  static peer(message, data = {}) {
    logger.info({ category: '🎧 PEER', ...normalizeData(data) }, message);
  }

  /**
   * State-related logs
   */
  static state(message, data = {}) {
    logger.info({ category: '📊 STATE', ...normalizeData(data) }, message);
  }

  /**
   * Error logs
   */
  static error(message, error = {}) {
    let errorData;

    if (error instanceof Error) {
      errorData = {
        category: '❌ ERROR',
        error: error.message,
        stack: error.stack
      };
    } else if (error && typeof error === 'object') {
      errorData = {
        category: '❌ ERROR',
        ...error
      };
    } else {
      errorData = {
        category: '❌ ERROR',
        error: String(error)
      };
    }

    logger.error(errorData, message);
  }

  /**
   * Warning logs
   */
  static warn(message, data = {}) {
    logger.warn({ category: '⚠️  WARNING', ...normalizeData(data) }, message);
  }

  /**
   * Debug logs (only shown when LOG_LEVEL=debug)
   */
  static debug(message, data = {}) {
    logger.debug({ category: '🐛 DEBUG', ...normalizeData(data) }, message);
  }

  /**
   * Performance/metrics logs
   */
  static metrics(message, data = {}) {
    logger.info({ category: '📈 METRICS', ...normalizeData(data) }, message);
  }

  /**
   * Info logs (general information)
   */
  static info(message, data = {}) {
    logger.info({ category: 'ℹ️  INFO', ...normalizeData(data) }, message);
  }

  /**
   * Success logs (for successful operations)
   */
  static success(message, data = {}) {
    logger.info({ category: '✅ SUCCESS', ...normalizeData(data) }, message);
  }

  /**
   * Test helper to replace the underlying logger
   */
  static setLogger(customLogger) {
    logger = customLogger || logger;
  }

  /**
   * Restore default logger configuration
   */
  static resetLogger() {
    logger = createDefaultLogger();
  }
}

module.exports = PairingLogger;
