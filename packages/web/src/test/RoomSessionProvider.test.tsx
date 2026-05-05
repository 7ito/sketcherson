import type { ApiResult, CreateRoomSuccess, JoinRoomSuccess, RoomState, RoomStateSuccess } from '@7ito/sketcherson-common/room';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { RoomSessionProvider, useRoomSession } from '../providers/RoomSessionProvider';
import { socket } from '../lib/socket';
import { GAME_WEB_CONFIG } from '../game';

vi.mock('../lib/socket', () => ({
  socket: {
    id: 'control-socket',
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  drawingSocket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

function buildRoomState(code: string, nickname: string): RoomState {
  return buildRoomStateWithPlayers(code, [{ id: 'player-1', nickname }]);
}

function buildRoomStateWithPlayers(code: string, players: Array<{ id: string; nickname: string }>): RoomState {
  return {
    code,
    shareUrl: `https://sketcherson.example/room/${code}`,
    status: 'lobby',
    players: players.map((player, index) => ({
      id: player.id,
      nickname: player.nickname,
      connected: true,
      reconnectBy: null,
      isHost: index === 0,
    })),
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

function CreateRoomProbe() {
  const { createRoom } = useRoomSession();

  return (
    <button type="button" onClick={() => void createRoom('  Guest  ')}>
      Create room
    </button>
  );
}

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  localStorage.clear();
  document.cookie = 'sketcherson-demo-preferred-nickname=; Max-Age=0; Path=/';
  vi.clearAllMocks();
});

describe('RoomSessionProvider', () => {
  it('keeps the active room state stable across the StrictMode effect replay after creating a room', async () => {
    const emittedEvents: string[] = [];

    vi.mocked(socket.emit).mockImplementation((event, _payload, callback) => {
      emittedEvents.push(event);

      if (event === 'room:create' && typeof callback === 'function') {
        const result: ApiResult<CreateRoomSuccess> = {
          ok: true,
          data: {
            playerId: 'player-1',
            sessionToken: 'session-1',
            room: buildRoomState('ABCDEF', 'Guest'),
          },
        };

        callback(result);
      }

      return socket;
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <RoomSessionProvider>
            <App />
          </RoomSessionProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Room/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Create Room/ }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByText('ABCDEF')).toBeInTheDocument();
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(emittedEvents.filter((event) => event === 'room:create')).toHaveLength(1);
    expect(emittedEvents.filter((event) => event === 'room:reclaim')).toHaveLength(0);
  });

  it('keeps a direct room join on the joined lobby in StrictMode', async () => {
    vi.mocked(socket.emit).mockImplementation((event, payload, callback) => {
      if (event === 'room:getState' && typeof callback === 'function') {
        const result: ApiResult<RoomStateSuccess> = {
          ok: true,
          data: { room: buildRoomState('ABCDEF', 'Host') },
        };
        callback(result);
        return socket;
      }

      if (event === 'room:join' && typeof callback === 'function') {
        const result: ApiResult<JoinRoomSuccess> = {
          ok: true,
          data: {
            playerId: 'player-2',
            sessionToken: 'session-2',
            room: buildRoomStateWithPlayers('ABCDEF', [
              { id: 'player-1', nickname: 'Host' },
              { id: 'player-2', nickname: (payload as { nickname: string }).nickname },
            ]),
          },
        };
        callback(result);
        return socket;
      }

      return socket;
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/room/ABCDEF']}>
          <RoomSessionProvider>
            <App />
          </RoomSessionProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Room ABCDEF' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    await waitFor(() => {
      expect(screen.getByText(GAME_WEB_CONFIG.ui.copy.room.playersHeader)).toBeInTheDocument();
    });
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('stores the preferred nickname cookie after a successful room create', async () => {
    vi.mocked(socket.emit).mockImplementation((event, _payload, callback) => {
      if (event !== 'room:create' || typeof callback !== 'function') {
        return socket;
      }

      const result: ApiResult<CreateRoomSuccess> = {
        ok: true,
        data: {
          playerId: 'player-1',
          sessionToken: 'session-1',
          room: buildRoomState('ABCDEF', 'Guest'),
        },
      };

      callback(result);
      return socket;
    });

    render(
      <RoomSessionProvider>
        <CreateRoomProbe />
      </RoomSessionProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));

    await waitFor(() => {
      expect(document.cookie).toContain('sketcherson-demo-preferred-nickname=Guest');
    });
  });
});
