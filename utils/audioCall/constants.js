const DEFAULT_STUNS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

const DEFAULT_TONES = Object.freeze({
  DIAL: 'dial',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected'
});

const parseServerList = (raw) => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((url) => ({ urls: url }));
};

const buildTurnServers = () => {
  const url = process.env.AUDIOCALL_TURN_URL;
  if (!url) return [];

  const username = process.env.AUDIOCALL_TURN_USER || undefined;
  const credential = process.env.AUDIOCALL_TURN_PASSWORD || undefined;

  return [
    {
      urls: url,
      username,
      credential
    }
  ];
};

const getIceServers = () => {
  const stunFromEnv = parseServerList(process.env.AUDIOCALL_STUNS);
  const iceServers = stunFromEnv.length ? stunFromEnv : DEFAULT_STUNS;
  return [...iceServers, ...buildTurnServers()];
};

const normalizeProtocol = (value) => {
  if (!value) return 'http:';
  const trimmed = value.toString().trim().toLowerCase();
  if (!trimmed) return 'http:';
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
};

const getPeerServerConfig = () => {
  const host = process.env.AUDIOCALL_PEER_PUBLIC_HOST || process.env.AUDIOCALL_SERVER_HOST || process.env.SERVER_PUBLIC_HOST || 'localhost';
  const port = process.env.AUDIOCALL_PEER_PUBLIC_PORT || process.env.AUDIOCALL_SERVER_PORT || process.env.PORT || '1000';
  const protocol = normalizeProtocol(process.env.AUDIOCALL_PEER_PUBLIC_PROTOCOL || process.env.AUDIOCALL_SERVER_PROTOCOL || 'http');
  const path = process.env.AUDIOCALL_PEER_PUBLIC_PATH || '/peerjs';
  const numericPort = port === '' ? '' : String(port);

  return {
    host,
    port: numericPort,
    protocol,
    secure: protocol === 'https:',
    path
  };
};

const getRTCConfig = () => ({
  iceServers: getIceServers(),
  iceTransportPolicy: 'all'
});

module.exports = {
  getRTCConfig,
  getPeerServerConfig,
  TONES: DEFAULT_TONES
};
