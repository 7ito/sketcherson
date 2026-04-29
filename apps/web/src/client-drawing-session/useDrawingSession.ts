import type { ApiResult, DrawingActionSuccess, LobbyDrawingActionSuccess, RoomStatus } from '@sketcherson/common/room';
import { DRAWING_CANVAS_WIDTH, type DrawingAction, type DrawingState } from '@sketcherson/common/drawing';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from 'react';
import { renderDrawingStateToCanvas } from '../lib/drawing';
import {
  estimateSerializedPayloadBytes,
  recordDrawerExtendBatchAcknowledged,
  recordDrawerExtendBatchSent,
  recordDrawingPaint,
  type DrawingMetricsTarget,
} from '../lib/drawingMetrics';
import { type OptimisticStroke, renderOptimisticStrokeOverlay } from './optimisticStroke';
import { createDrawingInputSession, type DrawingInputSession } from './DrawingInputSession';
import type { DrawingSessionExtendAck, DrawingSessionExtendBatch } from './DrawingSessionController';
import { getCanvasPoint } from './pointerGeometry';
import { getAdjustedBrushSize } from './brushControls';
import { useDrawingSessionControls, type DrawingSessionControls } from './useDrawingSessionControls';

export type DrawingSessionTarget = DrawingMetricsTarget;

export type DrawingSessionActionSuccess = DrawingActionSuccess | LobbyDrawingActionSuccess;

export interface UseDrawingSessionOptions {
  roomCode?: string;
  target: DrawingSessionTarget;
  drawing: DrawingState | null;
  roomStatus: RoomStatus;
  canDraw: boolean;
  submitAction(action: DrawingAction): Promise<ApiResult<DrawingSessionActionSuccess>>;
}

export interface DrawingSessionCanvasHandlers {
  ref: RefObject<HTMLCanvasElement | null>;
  onWheel(event: ReactWheelEvent<HTMLCanvasElement>): void;
  onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerLeave(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLCanvasElement>): void;
}

export interface DrawingSession {
  canvasHandlers: DrawingSessionCanvasHandlers;
  controls: DrawingSessionControls;
}

export function useDrawingSession({
  roomCode,
  target,
  drawing,
  roomStatus,
  canDraw,
  submitAction: submitActionOption,
}: UseDrawingSessionOptions): DrawingSession {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const optimisticStrokeRef = useRef<OptimisticStroke | null>(null);
  const drawingInputSessionRef = useRef<DrawingInputSession<DrawingSessionActionSuccess> | null>(null);
  const roomCodeRef = useRef(roomCode);
  const drawingTargetRef = useRef<DrawingMetricsTarget>('match');
  const undoRedoEnabled = target === 'match';
  const canRedo = undoRedoEnabled && Boolean(drawing?.undoneOperations.length);
  const controls = useDrawingSessionControls({
    canDraw,
    canRedo,
    undoRedoEnabled,
    submitAction: submitActionOption,
  });
  roomCodeRef.current = roomCode;
  drawingTargetRef.current = target;

  const { selectedTool, selectedColor, toolSize, clearActionError, submitAction } = controls;

  if (!drawingInputSessionRef.current) {
    drawingInputSessionRef.current = createDrawingInputSession<DrawingSessionActionSuccess>({
      submitAction,
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()),
      onOptimisticStrokeChange: (stroke) => {
        optimisticStrokeRef.current = stroke;
      },
      onExtendBatchSent: (batch: DrawingSessionExtendBatch) => {
        recordDrawerExtendBatchSent({
          roomCode: roomCodeRef.current,
          target: drawingTargetRef.current,
          batchId: batch.batchId,
          strokeId: batch.strokeId,
          pointsCount: batch.pointsCount,
          inFlightCount: batch.inFlightCount,
        });
      },
      onExtendBatchAcknowledged: (ack: DrawingSessionExtendAck) => {
        recordDrawerExtendBatchAcknowledged({
          roomCode: roomCodeRef.current,
          target: drawingTargetRef.current,
          batchId: ack.batchId,
          strokeId: ack.strokeId,
          pointsCount: ack.pointsCount,
          inFlightCount: ack.inFlightCount,
          ackBytes: estimateSerializedPayloadBytes(ack.result),
          ok: ack.result.ok,
          durationMs: ack.durationMs,
        });
      },
    });
  }

  const paintCanvas = () => {
    const renderStats = renderDrawingStateToCanvas(canvasRef.current, drawing);
    if (drawing && renderStats) {
      recordDrawingPaint({
        roomCode,
        target,
        role: canDraw ? 'drawer' : 'spectator',
        revision: drawing.revision,
        renderDurationMs: renderStats.renderDurationMs,
        committedLayerUpdated: renderStats.committedLayerUpdated,
        activeLayerUpdated: renderStats.activeLayerUpdated,
        operationsCount: renderStats.operationsCount,
        activeStrokePointCount: renderStats.activeStrokePointCount,
      });
    }

    renderOptimisticStrokeOverlay(canvasRef.current, drawing, optimisticStrokeRef.current);
  };

  const abortLocalStroke = () => {
    optimisticStrokeRef.current = null;
    drawingInputSessionRef.current?.cancel();
    paintCanvas();
  };

  const endStroke = async () => {
    const result = await drawingInputSessionRef.current?.end();
    if (result && !result.ok) paintCanvas();
  };

  useEffect(() => {
    paintCanvas();
  }, [drawing]);

  useEffect(() => () => {
    drawingInputSessionRef.current?.dispose();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDraw || selectedTool === 'fill') return;

    const updateCursor = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0) return;
      const scale = rect.width / (drawing?.width ?? DRAWING_CANVAS_WIDTH);
      const px = Math.max(2, Math.round(toolSize * scale));
      const r = px / 2;
      const size = px + 2;
      const center = size / 2;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${center}' cy='${center}' r='${r}' fill='none' stroke='%23000' stroke-width='1'/><circle cx='${center}' cy='${center}' r='${r}' fill='none' stroke='%23fff' stroke-width='1' stroke-dasharray='2 2'/></svg>`;
      canvas.style.cursor = `url("data:image/svg+xml,${svg}") ${center} ${center}, crosshair`;
    };

    updateCursor();
    const observer = new ResizeObserver(updateCursor);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canDraw, selectedTool, toolSize, drawing?.width]);

  useEffect(() => {
    if (roomStatus === 'round' || !drawingInputSessionRef.current?.getOptimisticStroke()) return;
    void endStroke();
  }, [roomStatus]);

  useEffect(() => {
    if (canDraw || !optimisticStrokeRef.current) return;
    abortLocalStroke();
  }, [canDraw]);

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!canDraw || event.ctrlKey || event.metaKey || event.altKey || event.deltaY === 0) return;
    event.preventDefault();
    controls.setSelectedSize((prev) => getAdjustedBrushSize(prev, event.deltaY < 0 ? 1 : -1));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    clearActionError();

    const point = getCanvasPoint(canvasRef.current, drawing, event);
    if (!point) return;

    if (selectedTool === 'fill') {
      void submitAction({ type: 'fill', color: selectedColor, point });
      return;
    }

    void drawingInputSessionRef.current?.begin({ point, tool: selectedTool, color: selectedColor, size: toolSize }).then((result) => {
      if (!result.ok) abortLocalStroke();
    });
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    renderOptimisticStrokeOverlay(canvasRef.current, drawing, optimisticStrokeRef.current);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !drawingInputSessionRef.current?.getOptimisticStroke()) return;
    const point = getCanvasPoint(canvasRef.current, drawing, event);
    if (!point) return;

    const previousPointCount = optimisticStrokeRef.current?.points.length ?? 0;
    drawingInputSessionRef.current.move(point);
    if (optimisticStrokeRef.current && optimisticStrokeRef.current.points.length > previousPointCount) {
      renderOptimisticStrokeOverlay(canvasRef.current, drawing, optimisticStrokeRef.current, previousPointCount - 1);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingInputSessionRef.current?.getOptimisticStroke()) return;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    void endStroke();
  };

  return {
    controls,
    canvasHandlers: {
      ref: canvasRef,
      onWheel: handleWheel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}
