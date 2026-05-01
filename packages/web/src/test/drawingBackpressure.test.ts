import { describe, expect, it } from 'vitest';
import {
  getBaseExtendFlushIntervalMs,
  getScheduledExtendFlushIntervalMs,
  updateExtendFlushIntervalFromAck,
} from '../lib/drawingBackpressure';

describe('drawingBackpressure', () => {
  it('starts from the base flush interval', () => {
    expect(getBaseExtendFlushIntervalMs()).toBe(33);
  });

  it('schedules slower flushes while extend batches are in flight', () => {
    expect(getScheduledExtendFlushIntervalMs(33, 0)).toBe(33);
    expect(getScheduledExtendFlushIntervalMs(33, 1)).toBe(66);
    expect(getScheduledExtendFlushIntervalMs(33, 2)).toBe(99);
    expect(getScheduledExtendFlushIntervalMs(99, 1)).toBe(99);
  });

  it('backs off after slow acknowledgements', () => {
    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 33,
        inFlightCount: 0,
        ackDurationMs: 80,
        ok: true,
      }),
    ).toBe(66);

    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 66,
        inFlightCount: 0,
        ackDurationMs: 150,
        ok: true,
      }),
    ).toBe(99);

    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 99,
        inFlightCount: 0,
        ackDurationMs: 250,
        ok: true,
      }),
    ).toBe(132);
  });

  it('backs off aggressively after failed acknowledgements', () => {
    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 66,
        inFlightCount: 0,
        ackDurationMs: 40,
        ok: false,
      }),
    ).toBe(132);
  });

  it('recovers gradually as the connection improves', () => {
    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 132,
        inFlightCount: 0,
        ackDurationMs: 50,
        ok: true,
      }),
    ).toBe(99);

    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 99,
        inFlightCount: 0,
        ackDurationMs: 50,
        ok: true,
      }),
    ).toBe(66);

    expect(
      updateExtendFlushIntervalFromAck({
        currentIntervalMs: 66,
        inFlightCount: 0,
        ackDurationMs: 50,
        ok: true,
      }),
    ).toBe(33);
  });
});
