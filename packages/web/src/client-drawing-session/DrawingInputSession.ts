import type { ApiResult, DrawingActionSuccess, LobbyDrawingActionSuccess } from '@7ito/sketcherson-common/room';
import { DRAWING_COLORS, type DrawingAction, type DrawingPoint, type DrawingTool } from '@7ito/sketcherson-common/drawing';
import { createStrokeId, type OptimisticStroke } from './optimisticStroke';
import { DrawingSessionController, type DrawingSessionControllerOptions, type DrawingSessionExtendAck, type DrawingSessionExtendBatch, type ExtendBatchSuccess } from './DrawingSessionController';

export type DrawingInputSessionActionSuccess = DrawingActionSuccess | LobbyDrawingActionSuccess;

export interface DrawingInputSessionBeginInput {
  point: DrawingPoint;
  tool: Exclude<DrawingTool, 'fill'>;
  color: string;
  size: number;
}

export interface DrawingInputSessionOptions<TSuccess extends ExtendBatchSuccess = DrawingInputSessionActionSuccess> {
  submitAction(action: DrawingAction): Promise<ApiResult<TSuccess>>;
  createStrokeId?: () => string;
  setTimeout?: DrawingSessionControllerOptions['setTimeout'];
  clearTimeout?: DrawingSessionControllerOptions['clearTimeout'];
  now?: DrawingSessionControllerOptions['now'];
  onOptimisticStrokeChange?(stroke: OptimisticStroke | null): void;
  onExtendBatchSent?(batch: DrawingSessionExtendBatch): void;
  onExtendBatchAcknowledged?(ack: DrawingSessionExtendAck): void;
}

export interface DrawingInputSession<TSuccess extends ExtendBatchSuccess = DrawingInputSessionActionSuccess> {
  begin(input: DrawingInputSessionBeginInput): Promise<ApiResult<TSuccess>>;
  move(point: DrawingPoint): void;
  end(): Promise<ApiResult<TSuccess> | null>;
  cancel(): void;
  submit(action: DrawingAction): Promise<ApiResult<TSuccess>>;
  getOptimisticStroke(): OptimisticStroke | null;
  dispose(): void;
}

export function createDrawingInputSession<TSuccess extends ExtendBatchSuccess = DrawingInputSessionActionSuccess>(
  options: DrawingInputSessionOptions<TSuccess>,
): DrawingInputSession<TSuccess> {
  let optimisticStroke: OptimisticStroke | null = null;
  let beginStrokePromise: Promise<ApiResult<TSuccess>> | null = null;
  const makeStrokeId = options.createStrokeId ?? createStrokeId;
  const notifyOptimisticStrokeChange = () => options.onOptimisticStrokeChange?.(optimisticStroke);

  let controller: DrawingSessionController;
  controller = new DrawingSessionController({
    setTimeout: options.setTimeout ?? ((callback, delayMs) => window.setTimeout(callback, delayMs)),
    clearTimeout: options.clearTimeout ?? ((timerId) => window.clearTimeout(timerId)),
    now: options.now ?? (() => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())),
    isStrokeActive: (strokeId): boolean => controller.getActiveStrokeId() === strokeId,
    sendExtendBatch: async (batch) => {
      options.onExtendBatchSent?.(batch);
      return options.submitAction({ type: 'extendStroke', strokeId: batch.strokeId, points: batch.points });
    },
    onExtendBatchAcknowledged: options.onExtendBatchAcknowledged,
  });

  const clearOptimisticStroke = () => {
    optimisticStroke = null;
    notifyOptimisticStrokeChange();
  };

  return {
    async begin(input) {
      const strokeId = makeStrokeId();
      const color = input.tool === 'eraser' ? DRAWING_COLORS[0] : input.color;
      controller.beginStroke(strokeId, input.point);
      optimisticStroke = {
        id: strokeId,
        tool: input.tool,
        color,
        size: input.size,
        points: [input.point],
      };
      notifyOptimisticStrokeChange();

      const resultPromise = options.submitAction({
        type: 'beginStroke',
        strokeId,
        tool: input.tool,
        color,
        size: input.size,
        point: input.point,
      });
      beginStrokePromise = resultPromise;
      const result = await resultPromise;
      if (beginStrokePromise === resultPromise) {
        beginStrokePromise = null;
      }
      if (!result.ok) {
        controller.abortActiveStroke();
        clearOptimisticStroke();
      }
      return result;
    },
    move(point) {
      const result = controller.extendActiveStroke(point);
      if (!result || !optimisticStroke) return;
      optimisticStroke.points.push(result.point);
      notifyOptimisticStrokeChange();
    },
    async end() {
      const strokeId = controller.endActiveStroke();
      if (!strokeId) return null;
      const beginResult = await beginStrokePromise;
      if (beginResult && !beginResult.ok) return null;
      const result = await options.submitAction({ type: 'endStroke', strokeId });
      clearOptimisticStroke();
      controller.resetPendingExtend();
      return result;
    },
    cancel() {
      beginStrokePromise = null;
      controller.abortActiveStroke();
      clearOptimisticStroke();
    },
    submit(action) {
      return options.submitAction(action);
    },
    getOptimisticStroke() {
      return optimisticStroke;
    },
    dispose() {
      controller.dispose();
      clearOptimisticStroke();
    },
  };
}
