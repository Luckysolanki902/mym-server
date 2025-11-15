const { expect } = require('chai');
const { getPeerServerConfig } = require('../utils/audioCall/constants');

describe('getPeerServerConfig()', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('defaults to localhost + 1000 + http', () => {
    delete process.env.AUDIOCALL_PEER_PUBLIC_HOST;
    delete process.env.AUDIOCALL_PEER_PUBLIC_PORT;
    delete process.env.AUDIOCALL_PEER_PUBLIC_PROTOCOL;
    const cfg = getPeerServerConfig();
    expect(cfg).to.include({ host: 'localhost', port: '1000' });
    expect(cfg.protocol).to.equal('http:');
    expect(cfg.secure).to.equal(false);
    expect(cfg.path).to.equal('/peerjs');
  });

  it('picks up provided env vars', () => {
    process.env.AUDIOCALL_PEER_PUBLIC_HOST = 'mym.example.com';
    process.env.AUDIOCALL_PEER_PUBLIC_PORT = '443';
    process.env.AUDIOCALL_PEER_PUBLIC_PROTOCOL = 'https';
    process.env.AUDIOCALL_PEER_PUBLIC_PATH = '/my-peer';
    const cfg = getPeerServerConfig();
    expect(cfg.host).to.equal('mym.example.com');
    expect(cfg.port).to.equal('443');
    expect(cfg.protocol).to.equal('https:');
    expect(cfg.secure).to.equal(true);
    expect(cfg.path).to.equal('/my-peer');
  });
});
