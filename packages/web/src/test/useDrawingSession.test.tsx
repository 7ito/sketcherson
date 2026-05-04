import type { ApiResult, DrawingActionSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingState } from '@7ito/sketcherson-common/drawing';
import { act, renderHook } from '@testing-library/react';
import { useDrawingSession } from '../client-drawing-session';

function buildDrawingState(overrides?: Partial<DrawingState>): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [{ type: 'clear', previousOperations: [] }],
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

describe('useDrawingSession', () => {
  it('disables undo, redo, and clear actions for lobby target sessions', () => {
    const submitAction = buildSubmitActionMock();
    const { result } = renderHook(() => useDrawingSession({
      target: 'lobby',
      drawing: buildDrawingState(),
      roomStatus: 'lobby',
      canDraw: true,
      submitAction,
    }));

    act(() => {
      result.current.controls.undo();
      result.current.controls.redo();
      result.current.controls.clear();
    });

    expect(submitAction).not.toHaveBeenCalled();
  });
});
