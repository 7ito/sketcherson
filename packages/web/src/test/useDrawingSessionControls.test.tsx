import type { ApiResult, DrawingActionSuccess } from '@7ito/sketcherson-common/room';
import { DRAWING_COLORS, type DrawingAction } from '@7ito/sketcherson-common/drawing';
import { act, renderHook } from '@testing-library/react';
import { useDrawingSessionControls } from '../client-drawing-session';

function buildSubmitActionMock() {
  return vi.fn<(action: DrawingAction) => Promise<ApiResult<DrawingActionSuccess>>>().mockResolvedValue({
    ok: true,
    data: {
      roomCode: 'ABCDEF',
      revision: 1,
    },
  });
}

describe('useDrawingSessionControls', () => {
  it('handles tool shortcuts and undo submission', async () => {
    const submitAction = buildSubmitActionMock();
    const { result } = renderHook(() => useDrawingSessionControls({
      canDraw: true,
      canRedo: false,
      undoRedoEnabled: true,
      submitAction,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    expect(result.current.selectedTool).toBe('eraser');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    });
    expect(result.current.selectedTool).toBe('fill');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      await Promise.resolve();
    });
    expect(submitAction).toHaveBeenCalledWith({ type: 'undo' });
  });

  it('supports arrow key palette navigation with row and column wraparound', () => {
    const submitAction = buildSubmitActionMock();
    const { result } = renderHook(() => useDrawingSessionControls({
      canDraw: true,
      canRedo: false,
      undoRedoEnabled: true,
      submitAction,
    }));

    expect(result.current.selectedColor).toBe(DRAWING_COLORS[0]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[11]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[0]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[12]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[0]);
  });

  it('keeps WASD palette navigation aligned with the 12-column palette', () => {
    const submitAction = buildSubmitActionMock();
    const { result } = renderHook(() => useDrawingSessionControls({
      canDraw: true,
      canRedo: false,
      undoRedoEnabled: true,
      submitAction,
    }));

    act(() => {
      for (let i = 0; i < 11; i += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      }
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[11]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[0]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      for (let i = 0; i < 11; i += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      }
    });
    expect(result.current.selectedColor).toBe(DRAWING_COLORS[23]);
  });

  it('exposes toolbar command helpers without callers constructing protocol actions', () => {
    const submitAction = buildSubmitActionMock();
    const { result } = renderHook(() => useDrawingSessionControls({
      canDraw: true,
      canRedo: true,
      undoRedoEnabled: true,
      submitAction,
    }));

    act(() => {
      result.current.undo();
      result.current.redo();
      result.current.clear();
    });

    expect(submitAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'undo' },
      { type: 'redo' },
      { type: 'clear' },
    ]);
  });
});
