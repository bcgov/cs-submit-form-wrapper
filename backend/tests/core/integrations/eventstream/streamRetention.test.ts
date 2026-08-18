import { createEnvReader } from '../../../../src/core/config/env';
import { resolveStreamRetention } from '../../../../src/core/integrations/eventstream/streamRetention';

const reader = (source: Record<string, string>) => createEnvReader(source);

describe('resolveStreamRetention', () => {
  it('returns undefined for a stream with no declaration or override (unbounded)', () => {
    expect(resolveStreamRetention('orders', reader({}))).toBeUndefined();
  });

  it('reads a maxLen override for the stream', () => {
    expect(
      resolveStreamRetention('orders', reader({ EVENTSTREAM_RETENTION_ORDERS_MAXLEN: '500' })),
    ).toEqual({ maxLen: 500 });
  });

  it('reads a maxAgeMs override for the stream', () => {
    expect(
      resolveStreamRetention('orders', reader({ EVENTSTREAM_RETENTION_ORDERS_MAX_AGE_MS: '1000' })),
    ).toEqual({ maxAgeMs: 1000 });
  });

  it('normalizes the stream name into the env key', () => {
    const source = { EVENTSTREAM_RETENTION_SUBMISSION_EVENTS_MAXLEN: '10' };
    expect(resolveStreamRetention('submission.events', reader(source))).toEqual({ maxLen: 10 });
    expect(resolveStreamRetention('submission-events', reader(source))).toEqual({ maxLen: 10 });
  });

  it('does not let one stream override another', () => {
    const source = { EVENTSTREAM_RETENTION_ORDERS_MAXLEN: '500' };
    expect(resolveStreamRetention('invoices', reader(source))).toBeUndefined();
  });

  it('ignores an override that is not a positive integer, leaving the stream unbounded', () => {
    for (const value of ['0', '-1', 'abc', '1.5', '']) {
      expect(
        resolveStreamRetention('orders', reader({ EVENTSTREAM_RETENTION_ORDERS_MAXLEN: value })),
      ).toBeUndefined();
    }
  });
});

describe('resolveStreamRetention (code declarations)', () => {
  const declarations = { orders: { maxLen: 1000, maxAgeMs: 60_000 } };

  it('uses the declared limits when nothing is overridden', () => {
    expect(resolveStreamRetention('orders', reader({}), declarations)).toEqual({
      maxLen: 1000,
      maxAgeMs: 60_000,
    });
  });

  it('lets an override replace a declared limit without touching the other', () => {
    const source = { EVENTSTREAM_RETENTION_ORDERS_MAXLEN: '25' };
    expect(resolveStreamRetention('orders', reader(source), declarations)).toEqual({
      maxLen: 25,
      maxAgeMs: 60_000,
    });
  });

  it('falls back to the declared limit when the override is invalid', () => {
    const source = { EVENTSTREAM_RETENTION_ORDERS_MAXLEN: 'nope' };
    expect(resolveStreamRetention('orders', reader(source), declarations)?.maxLen).toBe(1000);
  });

  it('leaves undeclared streams unbounded', () => {
    expect(resolveStreamRetention('invoices', reader({}), declarations)).toBeUndefined();
  });
});
