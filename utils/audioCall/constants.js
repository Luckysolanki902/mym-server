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

const PairingLogger = require('../PairingLogger');

const pickFirstDefinedValue = (envKeys, defaultValue) => {
  for (const key of envKeys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return { value: value.trim(), source: key };
    }
  }

  return { value: defaultValue, source: 'default' };
};

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
  const hostCandidate = pickFirstDefinedValue(
    ['AUDIOCALL_PEER_PUBLIC_HOST', 'AUDIOCALL_SERVER_HOST', 'SERVER_PUBLIC_HOST'],
    'localhost'
  );
  const portCandidate = pickFirstDefinedValue(
    ['AUDIOCALL_PEER_PUBLIC_PORT', 'AUDIOCALL_SERVER_PORT', 'PORT'],
    '1000'
  );
  const protocolCandidate = pickFirstDefinedValue(
    ['AUDIOCALL_PEER_PUBLIC_PROTOCOL', 'AUDIOCALL_SERVER_PROTOCOL'],
    'http'
  );
  const pathCandidate = pickFirstDefinedValue(['AUDIOCALL_PEER_PUBLIC_PATH'], '/peerjs');
  const protocol = normalizeProtocol(protocolCandidate.value);
  const numericPort = portCandidate.value === '' ? '' : String(portCandidate.value);
  const secure = protocol === 'https:';
  const config = {
    host: hostCandidate.value,
    port: numericPort,
    protocol,
    secure,
    path: pathCandidate.value
  };

  PairingLogger.info('PeerJS server configuration resolved', {
    ...config,
    envSources: {
      host: hostCandidate.source,
      port: portCandidate.source,
      protocol: protocolCandidate.source,
      path: pathCandidate.source
    },
    rawValues: {
      host: hostCandidate.value,
      port: portCandidate.value,
      protocol: protocolCandidate.value,
      path: pathCandidate.value
    }
  });

  return config;
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
