import type { ApiResult, DrawingActionSuccess } from '@7ito/sketcherson-common/room';
import { DRAWING_BRUSH_SIZES, type DrawingAction, type DrawingState } from '@7ito/sketcherson-common/drawing';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DrawingCanvas } from '../components/DrawingCanvas';

function buildDrawingState(overrides?: Partial<DrawingState>): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
    ...overrides,
  };
}

function buildSubmitActionMock() {
  return vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockResolvedValue({
    ok: true,
    data: {
      roomCode: 'ABCDEF',
      revision: 1,
    },
  });
}

describe('DrawingCanvas', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('supports hidden number key binds for pen, eraser, and bucket', () => {
    const onSubmitAction = buildSubmitActionMock();

    render(
      <DrawingCanvas
        drawing={buildDrawingState()}
        roomStatus="lobby"
        canDraw
        onSubmitAction={onSubmitAction}
      />,
    );

    const penToolButton = screen.getByTitle('Pen (B)');
    const eraserToolButton = screen.getByTitle('Eraser (E)');
    const fillToolButton = screen.getByTitle('Fill (F)');

    expect(penToolButton).toHaveClass('tbtn-active');
    expect(eraserToolButton).not.toHaveClass('tbtn-active');
    expect(fillToolButton).not.toHaveClass('tbtn-active');

    fireEvent.keyDown(window, { key: '2' });
    expect(penToolButton).not.toHaveClass('tbtn-active');
    expect(eraserToolButton).toHaveClass('tbtn-active');
    expect(fillToolButton).not.toHaveClass('tbtn-active');

    fireEvent.keyDown(window, { key: '3' });
    expect(penToolButton).not.toHaveClass('tbtn-active');
    expect(eraserToolButton).not.toHaveClass('tbtn-active');
    expect(fillToolButton).toHaveClass('tbtn-active');

    fireEvent.keyDown(window, { key: '1' });
    expect(penToolButton).toHaveClass('tbtn-active');
    expect(eraserToolButton).not.toHaveClass('tbtn-active');
    expect(fillToolButton).not.toHaveClass('tbtn-active');
  });

  it('changes brush size with the mouse wheel while hovering the canvas', () => {
    const onSubmitAction = buildSubmitActionMock();
    const drawing = buildDrawingState();

    const { container } = render(
      <DrawingCanvas
        drawing={drawing}
        roomStatus="lobby"
        canDraw
        onSubmitAction={onSubmitAction}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const smallestSizeButton = screen.getByRole('button', { name: `Brush size ${DRAWING_BRUSH_SIZES[0]}` });
    const defaultSizeButton = screen.getByRole('button', { name: `Brush size ${DRAWING_BRUSH_SIZES[1]}` });
    const largerSizeButton = screen.getByRole('button', { name: `Brush size ${DRAWING_BRUSH_SIZES[2]}` });

    expect(defaultSizeButton).toHaveClass('size-btn-active');
    expect(largerSizeButton).not.toHaveClass('size-btn-active');

    fireEvent.wheel(canvas as HTMLCanvasElement, { deltaY: -100 });
    expect(defaultSizeButton).not.toHaveClass('size-btn-active');
    expect(largerSizeButton).toHaveClass('size-btn-active');

    fireEvent.wheel(canvas as HTMLCanvasElement, { deltaY: 100 });
    expect(defaultSizeButton).toHaveClass('size-btn-active');
    expect(largerSizeButton).not.toHaveClass('size-btn-active');

    fireEvent.wheel(canvas as HTMLCanvasElement, { deltaY: 100 });
    expect(smallestSizeButton).toHaveClass('size-btn-active');
  });

  it('moves focus from a chat input to the canvas when drawing starts', () => {
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    const onSubmitAction = buildSubmitActionMock();

    const { container } = render(
      <>
        <input aria-label="Chat" />
        <DrawingCanvas
          drawing={buildDrawingState()}
          roomStatus="round"
          canDraw
          onSubmitAction={onSubmitAction}
        />
      </>,
    );

    const input = screen.getByLabelText('Chat');
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    const canvasElement = canvas as HTMLCanvasElement;

    Object.defineProperty(canvasElement, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    input.focus();
    expect(input).toHaveFocus();

    fireEvent.pointerDown(canvasElement, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 1 });

    expect(input).not.toHaveFocus();
    expect(canvasElement).toHaveFocus();
  });

  it('keeps the local stroke alive after a failed extend ack so the stroke can still complete', async () => {
    vi.useFakeTimers();
    window.PointerEvent = MouseEvent as typeof PointerEvent;

    const onSubmitAction = vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockImplementation(async (action) => {
      if (action.type === 'extendStroke') {
        return {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Slow down',
          },
        };
      }

      return {
        ok: true,
        data: {
          roomCode: 'ABCDEF',
          revision: 1,
        },
      };
    });

    const { container } = render(
      <DrawingCanvas
        drawing={buildDrawingState()}
        roomStatus="round"
        canDraw
        onSubmitAction={onSubmitAction}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const canvasElement = canvas as HTMLCanvasElement;

    Object.defineProperty(canvasElement, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });
    canvasElement.setPointerCapture = vi.fn();
    canvasElement.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(canvasElement, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvasElement, { buttons: 1, clientX: 120, clientY: 120, pointerId: 1 });

    await act(async () => {
      vi.advanceTimersByTime(34);
      await Promise.resolve();
    });

    fireEvent.pointerUp(canvasElement, { pointerId: 1 });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSubmitAction.mock.calls.map(([action]) => action.type)).toEqual([
      'beginStroke',
      'extendStroke',
      'extendStroke',
      'endStroke',
    ]);
  });
});
