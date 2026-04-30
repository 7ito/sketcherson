import type { DrawingState } from '@sketcherson/common/drawing';
import type { ApiResult, DrawingActionSuccess, RoomState } from '@sketcherson/common/room';
import { fireEvent, render, screen } from '@testing-library/react';
import { MatchView } from '../components/room-page/MatchView';

function buildDrawingState(): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
  };
}

function buildRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDEF',
    shareUrl: 'https://sketcherson.example/room/ABCDEF',
    status: 'round',
    match: {
      phaseEndsAt: Date.now() + 30_000,
      currentTurn: {
        turnNumber: 1,
        totalTurns: 2,
        drawerPlayerId: 'host-1',
        drawerNickname: 'Host',
        prompt: null,
        promptVisibility: 'hidden',
        rerollsRemaining: 1,
        rerolledFrom: null,
        correctGuessPlayerIds: [],
        drawing: buildDrawingState(),
      },
      completedTurns: [],
      chatMessages: [],
      scoreboard: [
        { playerId: 'guest-1', nickname: 'Guest', score: 0 },
        { playerId: 'host-1', nickname: 'Host', score: 0 },
      ],
    },
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      turnsPerPlayer: 1,
      artEnabled: true,
    },
    players: [
      { id: 'host-1', nickname: 'Host', connected: true, reconnectBy: null, isHost: true },
      { id: 'guest-1', nickname: 'Guest', connected: true, reconnectBy: null, isHost: false },
    ],
    ...overrides,
  };
}

function renderMatchView(room: RoomState, currentPlayerId = 'guest-1') {
  return render(
    <MatchView
      room={room}
      currentPlayerId={currentPlayerId}
      connectionNotice={null}
      onPause={vi.fn()}
      onResume={vi.fn()}
      onReroll={vi.fn()}
      onKickPlayer={vi.fn()}
      onSubmitDrawingAction={vi.fn<(action: unknown) => Promise<ApiResult<DrawingActionSuccess>>>()}
      onSubmitMessage={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
}

describe('MatchView chat focus shortcuts', () => {
  it('focuses chat and keeps the typed character when a non-drawer starts typing', () => {
    renderMatchView(buildRoom());

    fireEvent.keyDown(window, { key: 'h' });

    const input = screen.getByPlaceholderText('Type your guess…');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('h');
  });

  it('does not steal drawing keybinds from the active drawer', () => {
    renderMatchView(buildRoom(), 'host-1');

    fireEvent.keyDown(window, { key: 'b' });

    expect(screen.getByPlaceholderText('Chat with the room…')).not.toHaveFocus();
  });

  it('ignores typing shortcuts while chat is disabled', () => {
    const room = buildRoom({
      match: {
        ...buildRoom().match!,
        currentTurn: {
          ...buildRoom().match!.currentTurn!,
          correctGuessPlayerIds: ['guest-1'],
        },
      },
    });

    renderMatchView(room);

    fireEvent.keyDown(window, { key: 'h' });

    const input = screen.getByPlaceholderText('Type your guess…');
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('');
  });
});
