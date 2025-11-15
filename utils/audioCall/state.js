const CALL_STATES = Object.freeze({
  IDLE: 'IDLE',
  WAITING: 'WAITING',
  PREPARING_MIC: 'PREPARING_MIC',
  DIALING: 'DIALING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ENDED: 'ENDED',
});

const MIC_STATUS = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  PROMPT: 'PROMPT',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
});

const normalizeMicStatus = (status) => {
  const upper = typeof status === 'string' ? status.toUpperCase() : '';
  if (upper && MIC_STATUS[upper]) {
    return MIC_STATUS[upper];
  }
  return MIC_STATUS.UNKNOWN;
};

const setUserCallState = (user, newState) => {
  if (!user) return;
  user.callState = newState;
  user.lastCallStateAt = Date.now();
};

const setMicStatus = (user, status) => {
  if (!user) return;
  user.micStatus = normalizeMicStatus(status);
};

module.exports = {
  CALL_STATES,
  MIC_STATUS,
  normalizeMicStatus,
  setUserCallState,
  setMicStatus,
};
