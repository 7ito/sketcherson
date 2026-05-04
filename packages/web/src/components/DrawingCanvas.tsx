import type { ApiResult, RoomStatus } from '@7ito/sketcherson-common/room';
import { formatShellCopy } from '@7ito/sketcherson-common/game';
import { DRAWING_BRUSH_SIZES, DRAWING_CANVAS_HEIGHT, DRAWING_CANVAS_WIDTH, DRAWING_COLORS, type DrawingAction, type DrawingState } from '@7ito/sketcherson-common/drawing';
import { useDrawingSession, type DrawingSessionActionSuccess, type DrawingSessionTarget } from '../client-drawing-session';
import { GAME_WEB_CONFIG } from '../game';
import { Toast } from './Toast';

const SHELL_DRAWING_TOOLBAR_COPY = GAME_WEB_CONFIG.ui.copy.drawingToolbar;

export function DrawingCanvas({
  roomCode,
  drawing,
  roomStatus,
  canDraw,
  onSubmitAction,
  target = 'match',
}: {
  roomCode?: string;
  target?: DrawingSessionTarget;
  drawing: DrawingState | null;
  roomStatus: RoomStatus;
  canDraw: boolean;
  onSubmitAction: (action: DrawingAction) => Promise<ApiResult<DrawingSessionActionSuccess>>;
}) {
  const session = useDrawingSession({
    roomCode,
    target,
    drawing,
    roomStatus,
    canDraw,
    submitAction: onSubmitAction,
  });
  const canRedo = target === 'match' && Boolean(drawing?.undoneOperations.length);
  const {
    selectedTool,
    selectedColor,
    selectedSize,
    actionError,
    setSelectedTool,
    setSelectedColor,
    setSelectedSize,
    clearActionError,
    undo,
    redo,
    clear,
  } = session.controls;

  return (
    <div className="canvas-area">
      <div className="canvas-viewport">
        <div className={canDraw ? 'canvas-frame' : 'canvas-frame spectator'}>
          <canvas
            ref={session.canvasHandlers.ref}
            className={canDraw ? 'editable' : undefined}
            width={drawing?.width ?? DRAWING_CANVAS_WIDTH}
            height={drawing?.height ?? DRAWING_CANVAS_HEIGHT}
            tabIndex={-1}
            onWheel={session.canvasHandlers.onWheel}
            onPointerDown={session.canvasHandlers.onPointerDown}
            onPointerMove={session.canvasHandlers.onPointerMove}
            onPointerUp={session.canvasHandlers.onPointerUp}
            onPointerLeave={session.canvasHandlers.onPointerLeave}
            onPointerCancel={session.canvasHandlers.onPointerCancel}
          />
        </div>
      </div>

      {canDraw ? (
        <div className="toolbar-strip">
          <div className="keyhint-wasd" aria-hidden="true">
            <span className="keyhint-key">↑</span>
            <span className="keyhint-key">←</span>
            <span className="keyhint-key">↓</span>
            <span className="keyhint-key">→</span>
          </div>
          <div className="palette" aria-label={SHELL_DRAWING_TOOLBAR_COPY.colorsLabel}>
            {DRAWING_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={selectedColor === color ? 'swatch swatch-active' : 'swatch'}
                style={{ background: color }}
                onClick={() => setSelectedColor(color)}
                aria-label={formatShellCopy(SHELL_DRAWING_TOOLBAR_COPY.pickColor, { color })}
              />
            ))}
          </div>
          <div className="toolbar-hinted">
            <div className="tool-cluster">
              <button
                type="button"
                className={selectedTool === 'pen' ? 'tbtn tbtn-pen tbtn-active' : 'tbtn tbtn-pen'}
                onClick={() => setSelectedTool('pen')}
                title={SHELL_DRAWING_TOOLBAR_COPY.penTitle}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button
                type="button"
                className={selectedTool === 'eraser' ? 'tbtn tbtn-eraser tbtn-active' : 'tbtn tbtn-eraser'}
                onClick={() => setSelectedTool('eraser')}
                title={SHELL_DRAWING_TOOLBAR_COPY.eraserTitle}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
              </button>
              <button
                type="button"
                className={selectedTool === 'fill' ? 'tbtn tbtn-fill tbtn-active' : 'tbtn tbtn-fill'}
                onClick={() => setSelectedTool('fill')}
                title={SHELL_DRAWING_TOOLBAR_COPY.fillTitle}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 2-3 2-3s2 1.4 2 3Z"/></svg>
              </button>
              {target === 'lobby' ? null : (
                <>
                  <button
                    type="button"
                    className="tbtn tbtn-undo"
                    onClick={() => {
                      undo();
                    }}
                    title={SHELL_DRAWING_TOOLBAR_COPY.undoTitle}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                  </button>
                  <button
                    type="button"
                    className="tbtn tbtn-redo"
                    onClick={() => {
                      redo();
                    }}
                    title={SHELL_DRAWING_TOOLBAR_COPY.redoTitle}
                    disabled={!canRedo}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                  </button>
                  <button
                    type="button"
                    className="tbtn tbtn-danger"
                    onClick={() => {
                      clear();
                    }}
                    title={SHELL_DRAWING_TOOLBAR_COPY.clearTitle}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </>
              )}
            </div>
            <div className="keyhint-row" aria-hidden="true">
              <span className="keyhint-key">B</span>
              <span className="keyhint-key">E</span>
              <span className="keyhint-key">F</span>
              {target === 'lobby' ? null : (
                <>
                  <span className="keyhint-key">^Z</span>
                  <span className="keyhint-key">^Y</span>
                  <span className="keyhint-key" style={{ visibility: 'hidden' }} />
                </>
              )}
            </div>
          </div>
          <div className="toolbar-hinted">
            <div className="size-selector" aria-label={SHELL_DRAWING_TOOLBAR_COPY.brushSizeLabel}>
            {DRAWING_BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={selectedSize === size ? 'size-btn size-btn-active' : 'size-btn'}
                onClick={() => setSelectedSize(size)}
                aria-label={formatShellCopy(SHELL_DRAWING_TOOLBAR_COPY.brushSize, { size })}
              >
                <span className="size-dot" style={{ width: `${Math.max(4, size * 0.7)}px`, height: `${Math.max(4, size * 0.7)}px` }} />
              </button>
            ))}
            </div>
            <div className="keyhint-row" aria-hidden="true">
              <span className="keyhint-key">-</span>
              <span className="keyhint-key">+</span>
            </div>
          </div>
        </div>
      ) : null}

      {actionError ? <Toast message={actionError} onDismiss={clearActionError} /> : null}
    </div>
  );
}
