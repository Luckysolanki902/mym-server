const MAX_HISTORY = 200;

class AudioCallMetrics {
  constructor() {
    this.activeCalls = new Map();
    this.history = [];
    this.qualitySamples = [];
  }

  startCall(roomId) {
    if (!roomId) return;
    if (!this.activeCalls.has(roomId)) {
      this.activeCalls.set(roomId, { startedAt: Date.now() });
    }
  }

  endCall(roomId, reason = 'hangup') {
    const entry = this.activeCalls.get(roomId);
    const endedAt = Date.now();
    const durationMs = entry ? endedAt - entry.startedAt : 0;
    if (roomId) {
      this.activeCalls.delete(roomId);
    }

    this.history.push({ roomId, reason, durationMs, endedAt });
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }

    return durationMs;
  }

  recordQuality(roomId, stats = {}) {
    const sample = { roomId, timestamp: Date.now(), ...stats };
    this.qualitySamples.push(sample);
    if (this.qualitySamples.length > MAX_HISTORY) {
      this.qualitySamples.splice(0, this.qualitySamples.length - MAX_HISTORY);
    }
  }

  getStats() {
    const totalDuration = this.history.reduce((acc, item) => acc + item.durationMs, 0);
    const avgDuration = this.history.length ? Math.round(totalDuration / this.history.length) : 0;

    const failuresByReason = this.history.reduce((acc, item) => {
      const key = item.reason || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const recentQuality = this.qualitySamples.slice(-20);
    const avgQuality = recentQuality.reduce(
      (acc, sample) => {
        acc.rtt += sample.rtt || 0;
        acc.jitter += sample.jitter || 0;
        acc.packetLoss += sample.packetLoss || 0;
        return acc;
      },
      { rtt: 0, jitter: 0, packetLoss: 0 }
    );

    if (recentQuality.length) {
      avgQuality.rtt = Math.round(avgQuality.rtt / recentQuality.length);
      avgQuality.jitter = Math.round(avgQuality.jitter / recentQuality.length);
      avgQuality.packetLoss = Number((avgQuality.packetLoss / recentQuality.length).toFixed(2));
    }

    return {
      activeCalls: this.activeCalls.size,
      avgDuration,
      failuresByReason,
      avgQuality,
      samplesTracked: {
        history: this.history.length,
        quality: this.qualitySamples.length
      }
    };
  }
}

module.exports = new AudioCallMetrics();
