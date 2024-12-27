// utils/logger.js
const log = (level, message) => {
    const timestamp = new Date().toISOString();
    switch (level) {
      case 'info':
        console.info(`[${timestamp}] INFO: ${message}`);
        break;
      case 'warn':
        console.warn(`[${timestamp}] WARN: ${message}`);
        break;
      case 'error':
        console.error(`[${timestamp}] ERROR: ${message}`);
        break;
      default:
        console.log(`[${timestamp}] ${message}`);
    }
  };
  
  module.exports = log;
  