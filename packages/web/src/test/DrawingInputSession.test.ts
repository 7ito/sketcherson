import type { ApiResult, DrawingActionSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingPoint } from '@7ito/sketcherson-common/drawing';
import { createDrawingInputSession } from '../client-drawing-session';

function ok(revision: number): ApiResult<DrawingActionSuccess> {
  return {
    ok: true,
    data: {
      roomCode: 'ABCDEF',
      revision,
    },
  };
}

function fail(message = 'nope'): ApiResult<DrawingActionSuccess> {
  return {
    ok: false,
    error: {
      code: 'INVALID_DRAWING_ACTION',
      message,
    },
  };
}

const point = (x: number, y: number): DrawingPoint => ({ x, y });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('DrawingInputSession', () => {
  it('sends begin, batched extend, and end actions in order', async () => {
    let timer: (() => void) | null = null;
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>()
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce(ok(2))
      .mockResolvedValueOnce(ok(3));
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
      setTimeout: (callback) => {
        timer = callback;
        return 1;
      },
      clearTimeout: vi.fn(),
      now: () => 0,
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    session.move(point(2, 2));
    session.move(point(3, 3));
    timer?.();
    await Promise.resolve();
    await session.end();

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'beginStroke', strokeId: 'stroke-1', tool: 'pen', color: '#123456', size: 8, point: point(1, 1) },
      { type: 'extendStroke', strokeId: 'stroke-1', points: [point(2, 2), point(3, 3)] },
      { type: 'endStroke', strokeId: 'stroke-1' },
    ]);
    expect(session.getOptimisticStroke()).toBeNull();
  });

  it('aborts optimistic stroke when begin fails', async () => {
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockResolvedValue(fail());
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });

    expect(session.getOptimisticStroke()).toBeNull();
    session.move(point(2, 2));
    expect(submitAction).toHaveBeenCalledTimes(1);
  });

  it('waits for begin acknowledgement before submitting end', async () => {
    const begin = deferred<ApiResult<DrawingActionSuccess>>();
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>()
      .mockReturnValueOnce(begin.promise)
      .mockResolvedValueOnce(ok(2));
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
    });

    const beginResult = session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    const endResult = session.end();
    await Promise.resolve();

    expect(submitAction.mock.calls.map(([action]) => action.type)).toEqual(['beginStroke']);

    begin.resolve(ok(1));
    await beginResult;
    await endResult;

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'beginStroke', strokeId: 'stroke-1', tool: 'pen', color: '#123456', size: 8, point: point(1, 1) },
      { type: 'endStroke', strokeId: 'stroke-1' },
    ]);
  });

  it('does not submit end when delayed begin fails', async () => {
    const begin = deferred<ApiResult<DrawingActionSuccess>>();
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockReturnValueOnce(begin.promise);
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
    });

    const beginResult = session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    const endResult = session.end();
    begin.resolve(fail('begin failed'));

    await beginResult;
    await expect(endResult).resolves.toBeNull();
    expect(submitAction.mock.calls.map(([action]) => action.type)).toEqual(['beginStroke']);
  });

  it('requeues failed extend batches while the stroke is still active', async () => {
    let timer: (() => void) | null = null;
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>()
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce(fail('extend failed'))
      .mockResolvedValueOnce(ok(2))
      .mockResolvedValueOnce(ok(3))
      .mockResolvedValueOnce(ok(4));
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
      setTimeout: (callback) => {
        timer = callback;
        return 1;
      },
      clearTimeout: vi.fn(),
      now: () => 0,
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    session.move(point(2, 2));
    timer?.();
    await Promise.resolve();
    await Promise.resolve();
    session.move(point(3, 3));
    timer?.();
    await Promise.resolve();
    await session.end();

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'beginStroke', strokeId: 'stroke-1', tool: 'pen', color: '#123456', size: 8, point: point(1, 1) },
      { type: 'extendStroke', strokeId: 'stroke-1', points: [point(2, 2)] },
      { type: 'extendStroke', strokeId: 'stroke-1', points: [point(3, 3)] },
      { type: 'extendStroke', strokeId: 'stroke-1', points: [point(2, 2)] },
      { type: 'endStroke', strokeId: 'stroke-1' },
    ]);
  });

  it('does not requeue failed extend batches after cancel', async () => {
    let timer: (() => void) | null = null;
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>()
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce(fail('extend failed'));
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
      setTimeout: (callback) => {
        timer = callback;
        return 1;
      },
      clearTimeout: vi.fn(),
      now: () => 0,
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    session.move(point(2, 2));
    timer?.();
    session.cancel();
    await Promise.resolve();

    await session.end();
    expect(submitAction).toHaveBeenCalledTimes(2);
  });

  it('does not requeue failed extend batches after end', async () => {
    let timer: (() => void) | null = null;
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>()
      .mockResolvedValueOnce(ok(1))
      .mockResolvedValueOnce(fail('extend failed'))
      .mockResolvedValueOnce(ok(2));
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => 'stroke-1',
      setTimeout: (callback) => {
        timer = callback;
        return 1;
      },
      clearTimeout: vi.fn(),
      now: () => 0,
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    session.move(point(2, 2));
    timer?.();
    await session.end();
    await Promise.resolve();

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'beginStroke', strokeId: 'stroke-1', tool: 'pen', color: '#123456', size: 8, point: point(1, 1) },
      { type: 'extendStroke', strokeId: 'stroke-1', points: [point(2, 2)] },
      { type: 'endStroke', strokeId: 'stroke-1' },
    ]);
  });

  it('keeps a new quick stroke alive when the previous end acknowledgement resolves later', async () => {
    let timer: (() => void) | null = null;
    let strokeIndex = 0;
    const endStrokeOne = deferred<ApiResult<DrawingActionSuccess>>();
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockImplementation((action) => {
      if (action.type === 'endStroke' && action.strokeId === 'stroke-1') {
        return endStrokeOne.promise;
      }

      return Promise.resolve(ok(submitAction.mock.calls.length + 1));
    });
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => {
        strokeIndex += 1;
        return `stroke-${strokeIndex}`;
      },
      setTimeout: (callback) => {
        timer = callback;
        return 1;
      },
      clearTimeout: vi.fn(),
      now: () => 0,
    });

    await session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    const firstEnd = session.end();
    await Promise.resolve();
    await session.begin({ point: point(10, 10), tool: 'pen', color: '#654321', size: 8 });
    session.move(point(11, 11));

    endStrokeOne.resolve(ok(2));
    await firstEnd;

    expect(session.getOptimisticStroke()?.id).toBe('stroke-2');

    timer?.();
    await Promise.resolve();
    await session.end();

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'beginStroke', strokeId: 'stroke-1', tool: 'pen', color: '#123456', size: 8, point: point(1, 1) },
      { type: 'endStroke', strokeId: 'stroke-1' },
      { type: 'beginStroke', strokeId: 'stroke-2', tool: 'pen', color: '#654321', size: 8, point: point(10, 10) },
      { type: 'extendStroke', strokeId: 'stroke-2', points: [point(11, 11)] },
      { type: 'endStroke', strokeId: 'stroke-2' },
    ]);
  });

  it('does not let a delayed failed begin abort a newer quick stroke', async () => {
    let strokeIndex = 0;
    const firstBegin = deferred<ApiResult<DrawingActionSuccess>>();
    const submitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockImplementation((action) => {
      if (action.type === 'beginStroke' && action.strokeId === 'stroke-1') {
        return firstBegin.promise;
      }

      return Promise.resolve(ok(submitAction.mock.calls.length + 1));
    });
    const session = createDrawingInputSession({
      submitAction,
      createStrokeId: () => {
        strokeIndex += 1;
        return `stroke-${strokeIndex}`;
      },
      now: () => 0,
    });

    const firstBeginResult = session.begin({ point: point(1, 1), tool: 'pen', color: '#123456', size: 8 });
    const firstEnd = session.end();
    await session.begin({ point: point(10, 10), tool: 'pen', color: '#654321', size: 8 });

    firstBegin.resolve(fail('begin failed'));
    await firstBeginResult;
    await firstEnd;

    expect(session.getOptimisticStroke()?.id).toBe('stroke-2');
  });
});
