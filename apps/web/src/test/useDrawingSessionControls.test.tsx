import type { ApiResult, DrawingActionSuccess } from '@sketcherson/common/room';
import type { DrawingAction } from '@sketcherson/common/drawing';
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
