import type { ApiResult, DrawingActionSuccess, JoinRoomSuccess, ReclaimRoomSuccess, RerollTurnSuccess, RoomState, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContextType } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../components/HomePage';
import { RoomPage } from '../components/RoomPage';
import { writePreferredNickname } from '../lib/preferredNickname';
import { RoomSessionContext } from '../providers/RoomSessionProvider';

function buildRoomState(code: string, nickname: string): RoomState {
  return {
    code,
    shareUrl: `https://sketcherson.example/room/${code}`,
    status: 'lobby',
    players: [
      {
        id: 'player-1',
        nickname,
        connected: true,
        reconnectBy: null,
        isHost: true,
      },
    ],
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      turnsPerPlayer: 1,
      artEnabled: true,
    },
    match: null,
    lobbyDrawing: null,
  };
}

function buildContextValue(overrides?: Partial<NonNullable<ContextType<typeof RoomSessionContext>>>) {
  return {
    activeRoom: null,
    joinedSession: null,
    sessionRecoveryError: null,
    roomExitNotice: null,
    connectionNotice: null,
    createRoom: vi.fn(),
    joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
    reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
    lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
    updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
    startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
    pauseRoom: vi.fn(),
    resumeRoom: vi.fn(),
    kickPlayer: vi.fn(),
    rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
    submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
    submitLobbyDrawingAction: vi.fn(),
    submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
  document.cookie = 'sketcherson-demo-preferred-nickname=; Max-Age=0; Path=/';
});

describe('preferred nickname cookie', () => {
  it('prefills the home page modal from the saved cookie', () => {
    writePreferredNickname('Guest');

    render(
      <MemoryRouter initialEntries={['/']}>
        <RoomSessionContext.Provider value={buildContextValue()}>
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Room/ }));

    expect(screen.getByLabelText('Your Name')).toHaveValue('Guest');
  });

  it('prefills the direct room join form from the saved cookie', async () => {
    writePreferredNickname('SavedGuest');

    const lookupRoom = vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: buildRoomState('ABCDEF', 'Host'),
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider value={buildContextValue({ lookupRoom })}>
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Room ABCDEF' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Nickname')).toHaveValue('SavedGuest');
  });
});
