import { describe, it, expect, vi } from 'vitest';
import { buildCorsOptions } from '../src/cors_config';

describe('buildCorsOptions', () => {
  it('allows any origin when no allowlist is configured', () => {
    const options = buildCorsOptions([]);
    expect(options.origin).toBe(true);
  });

  it('allows a request with no Origin header at all, regardless of the allowlist', () => {
    const options = buildCorsOptions(['https://allowed.example']);
    const callback = vi.fn();

    (options.origin as Function)(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows an origin that is in the configured allowlist', () => {
    const options = buildCorsOptions(['https://allowed.example', 'https://other.example']);
    const callback = vi.fn();

    (options.origin as Function)('https://allowed.example', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects an origin that is not in the configured allowlist', () => {
    const options = buildCorsOptions(['https://allowed.example']);
    const callback = vi.fn();

    (options.origin as Function)('https://attacker.example', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, allowed] = callback.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(allowed).toBeUndefined();
  });
});
