import type { DrawingState } from '@7ito/sketcherson-common/drawing';
import type { ApiResult, DrawingActionSuccess, RoomState } from '@7ito/sketcherson-common/room';
import { act, fireEvent, render, screen } from '@testing-library/react';

const soundEffectsPlay = vi.hoisted(() => vi.fn());

vi.mock('../lib/soundEffects', () => ({
  soundEffects: {
    play: soundEffectsPlay,
  },
}));

import { MatchView } from '../components/room-page/MatchView';
import { WebExtensionSlotsProvider, type SketchersonWebSlots } from '../components/WebExtensionSlots';

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

function renderMatchView(room: RoomState, currentPlayerId = 'guest-1', slots?: SketchersonWebSlots) {
  return render(
    <WebExtensionSlotsProvider slots={slots}>
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
      />
    </WebExtensionSlotsProvider>,
  );
}

describe('MatchView extension slots', () => {
  it('renders an injected prompt reference panel for the drawer', () => {
    const room = buildRoom({
      match: {
        ...buildRoom().match!,
        currentTurn: {
          ...buildRoom().match!.currentTurn!,
          prompt: 'Dragon',
          promptVisibility: 'visible',
        },
      },
    });

    renderMatchView(room, 'host-1', {
      promptReferencePanel: ({ visibility, room: slotRoom }) => (
        <aside>Injected {visibility} panel for {slotRoom.match?.currentTurn?.prompt}</aside>
      ),
    });

    expect(screen.getByText('Injected drawer panel for Dragon')).toBeInTheDocument();
    expect(screen.queryByText('Only you can see this prompt')).not.toBeInTheDocument();
  });
});

describe('MatchView round warning audio', () => {
  afterEach(() => {
    vi.useRealTimers();
    soundEffectsPlay.mockClear();
  });

  it('does not play from stale countdown seconds when the round starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));

    const countdownRoom = buildRoom({
      status: 'countdown',
      match: {
        ...buildRoom().match!,
        phaseEndsAt: Date.now() + 1_000,
      },
    });
    const { rerender } = renderMatchView(countdownRoom);

    const roundRoom = buildRoom({
      status: 'round',
      match: {
        ...countdownRoom.match!,
        phaseEndsAt: Date.now() + 60_000,
      },
    });

    rerender(
      <MatchView
        room={roundRoom}
        currentPlayerId="guest-1"
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

    expect(soundEffectsPlay).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(49_999);
    });
    expect(soundEffectsPlay).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(soundEffectsPlay).toHaveBeenCalledWith('roundWarning');
  });

  it('does not play immediately when joining an already expiring round', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));

    renderMatchView(buildRoom({
      status: 'round',
      match: {
        ...buildRoom().match!,
        phaseEndsAt: Date.now() + 5_000,
      },
    }));

    expect(soundEffectsPlay).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(soundEffectsPlay).not.toHaveBeenCalled();
  });
});

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
