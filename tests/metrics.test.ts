import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryTracker } from '../src/telemetry/metrics';

describe('TelemetryTracker', () => {
  let telemetry: TelemetryTracker;

  beforeEach(() => {
    telemetry = new TelemetryTracker();
  });

  it('starts at zero, not pre-loaded with sample activity', () => {
    const metrics = telemetry.getMetrics();
    expect(metrics.totalRelayed).toBe(0);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.totalStroopsSpent).toBe(0);
  });

  it('tracks successes and failures independently', () => {
    telemetry.recordSuccess(1000);
    telemetry.recordSuccess(2000);
    telemetry.recordFailure();

    const metrics = telemetry.getMetrics();
    expect(metrics.totalRelayed).toBe(2);
    expect(metrics.totalFailed).toBe(1);
    expect(metrics.totalStroopsSpent).toBe(3000);
  });

  it('emits real Prometheus exposition format, not JSON with a Prometheus label', () => {
    telemetry.recordSuccess(500);
    const text = telemetry.getPrometheusText();

    expect(text).toContain('# TYPE gasless_relayer_relayed_total counter');
    expect(text).toContain('gasless_relayer_relayed_total 1');
    expect(text).toContain('gasless_relayer_stroops_spent_total 500');
    expect(() => JSON.parse(text)).toThrow();
  });
});
