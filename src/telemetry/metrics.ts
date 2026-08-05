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
}

export const telemetry = new TelemetryTracker();
