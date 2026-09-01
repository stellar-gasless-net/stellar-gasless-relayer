export class TelemetryTracker {
  private totalRelayed: number = 0;
  private totalFailed: number = 0;
  private totalStroopsSpent: number = 0;

  recordSuccess(feeStroops: number) {
    this.totalRelayed += 1;
    this.totalStroopsSpent += feeStroops;
  }

  recordFailure() {
    this.totalFailed += 1;
  }

  getMetrics() {
    return {
      totalRelayed: this.totalRelayed,
      totalFailed: this.totalFailed,
      totalStroopsSpent: this.totalStroopsSpent,
      totalXlmSpent: (this.totalStroopsSpent / 10000000).toFixed(4),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  /**
   * Real Prometheus text exposition format (https://prometheus.io/docs/instrumenting/exposition_formats/),
   * not just JSON with a Prometheus-sounding name.
   */
  getPrometheusText(): string {
    const lines = [
      '# HELP gasless_relayer_relayed_total Total transactions successfully relayed',
      '# TYPE gasless_relayer_relayed_total counter',
      `gasless_relayer_relayed_total ${this.totalRelayed}`,
      '# HELP gasless_relayer_failed_total Total transactions that failed to relay',
      '# TYPE gasless_relayer_failed_total counter',
      `gasless_relayer_failed_total ${this.totalFailed}`,
      '# HELP gasless_relayer_stroops_spent_total Total fee sponsored, in stroops',
      '# TYPE gasless_relayer_stroops_spent_total counter',
      `gasless_relayer_stroops_spent_total ${this.totalStroopsSpent}`,
      '# HELP gasless_relayer_uptime_seconds Process uptime in seconds',
      '# TYPE gasless_relayer_uptime_seconds gauge',
      `gasless_relayer_uptime_seconds ${Math.floor(process.uptime())}`,
    ];
    return lines.join('\n') + '\n';
  }
}

export const telemetry = new TelemetryTracker();
