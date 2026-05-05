import { DRAWING_MAX_EXTEND_POINTS } from '@7ito/sketcherson-common/drawing';
import type { ApiResult } from '@7ito/sketcherson-common/room';
import { DrawingSessionController, type DrawingSessionExtendBatch } from '../client-drawing-session';

function ok(): ApiResult<{ revision: number }> {
  return { ok: true, data: { revision: 1 } };
}

function rateLimited(): ApiResult<{ revision: number }> {
  return { ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } };
}

describe('DrawingSessionController', () => {
  it('tracks begin, extend, duplicate point, and end stroke transitions', () => {
    const sendExtendBatch = vi.fn<(batch: DrawingSessionExtendBatch) => Promise<ApiResult<{ revision: number }>>>()
      .mockResolvedValue(ok());
    const controller = new DrawingSessionController({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => performance.now(),
      isStrokeActive: (strokeId) => controller.getActiveStrokeId() === strokeId,
      sendExtendBatch,
    });

    expect(controller.isPointerActive()).toBe(false);
    expect(controller.beginStroke('stroke-1', { x: 1, y: 1 })).toEqual({
      strokeId: 'stroke-1',
      lastPoint: { x: 1, y: 1 },
    });
    expect(controller.isPointerActive()).toBe(true);
    expect(controller.extendActiveStroke({ x: 1, y: 1 })).toBeNull();
    expect(controller.extendActiveStroke({ x: 1.25, y: 1.25 })).toBeNull();
    expect(controller.extendActiveStroke({ x: 2, y: 2 })).toEqual({
      strokeId: 'stroke-1',
      previousPoint: { x: 1, y: 1 },
      point: { x: 2, y: 2 },
    });
    expect(controller.getPendingExtendPointCount()).toBe(1);
    expect(controller.endActiveStroke()).toBe('stroke-1');
    expect(controller.isPointerActive()).toBe(false);
    expect(controller.getActiveStrokeId()).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches queued extend points behind one timer', () => {
    vi.useFakeTimers();
    const sendExtendBatch = vi.fn<(batch: DrawingSessionExtendBatch) => Promise<ApiResult<{ revision: number }>>>()
      .mockResolvedValue(ok());
    const controller = new DrawingSessionController({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => performance.now(),
      isStrokeActive: () => true,
      sendExtendBatch,
    });

    controller.queueExtendPoint('stroke-1', { x: 1, y: 1 });
    controller.queueExtendPoint('stroke-1', { x: 2, y: 2 });

    expect(sendExtendBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(33);

    expect(sendExtendBatch).toHaveBeenCalledTimes(1);
    expect(sendExtendBatch.mock.calls[0]?.[0]).toMatchObject({
      batchId: 1,
      strokeId: 'stroke-1',
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      pointsCount: 2,
    });
  });

  it('splits queued extend points into server-sized batches', () => {
    vi.useFakeTimers();
    const sendExtendBatch = vi.fn<(batch: DrawingSessionExtendBatch) => Promise<ApiResult<{ revision: number }>>>()
      .mockResolvedValue(ok());
    const controller = new DrawingSessionController({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => performance.now(),
      isStrokeActive: () => true,
      sendExtendBatch,
    });
    const queuedPoints = Array.from({ length: DRAWING_MAX_EXTEND_POINTS + 2 }, (_, index) => ({ x: index + 1, y: index + 1 }));

    for (const queuedPoint of queuedPoints) {
      controller.queueExtendPoint('stroke-1', queuedPoint);
    }

    vi.advanceTimersByTime(33);

    expect(sendExtendBatch).toHaveBeenCalledTimes(2);
    expect(sendExtendBatch.mock.calls[0]?.[0].points).toHaveLength(DRAWING_MAX_EXTEND_POINTS);
    expect(sendExtendBatch.mock.calls[1]?.[0].points).toEqual(queuedPoints.slice(DRAWING_MAX_EXTEND_POINTS));
  });

  it('requeues failed extend batches while the stroke remains active', async () => {
    vi.useFakeTimers();
    const sendExtendBatch = vi.fn<(batch: DrawingSessionExtendBatch) => Promise<ApiResult<{ revision: number }>>>()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(ok());
    const controller = new DrawingSessionController({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => performance.now(),
      isStrokeActive: () => true,
      sendExtendBatch,
    });

    controller.queueExtendPoint('stroke-1', { x: 1, y: 1 });
    vi.advanceTimersByTime(33);
    await Promise.resolve();

    expect(controller.getPendingExtendPointCount()).toBe(1);

    controller.flushPendingExtend('stroke-1');
    await Promise.resolve();

    expect(sendExtendBatch).toHaveBeenCalledTimes(2);
    expect(sendExtendBatch.mock.calls[1]?.[0].points).toEqual([{ x: 1, y: 1 }]);
  });
});
