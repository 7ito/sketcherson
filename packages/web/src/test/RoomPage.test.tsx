import type { ApiResult, DrawingActionSuccess, JoinRoomSuccess, ReclaimRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingState } from '@7ito/sketcherson-common/drawing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoomPage } from '../components/RoomPage';
import { RoomSessionContext } from '../providers/RoomSessionProvider';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../game';

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

describe('RoomPage', () => {
  it('shows a clear not-found state for invalid room links', async () => {
    const lookupRoom = vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>().mockResolvedValue({
      ok: false,
      error: {
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found or expired.',
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/MISSING']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: null,
            joinedSession: null,
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom,
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Room not found' })).toBeInTheDocument();
    });

    expect(
      screen.getByText('This room link is no longer active. It may have expired, or the server may have restarted and cleared in-memory rooms.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('main').lastElementChild).toBe(screen.getByLabelText('Demo content notice'));
  });

  it('shows a recovery message when a stored session can no longer be restored', async () => {
    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: null,
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: {
              roomCode: 'ABCDEF',
              message: 'Your previous room session could not be restored. The room may have expired or the server may have restarted.',
            },
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue({
              ok: false,
              error: {
                code: 'ROOM_NOT_FOUND',
                message: 'Room not found or expired.',
              },
            }),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Session could not be restored' })).toBeInTheDocument();
    });

    expect(
      screen.getByText('Your previous room session could not be restored. The room may have expired or the server may have restarted.'),
    ).toBeInTheDocument();

    expect(screen.getByRole('main').lastElementChild).toBe(screen.getByLabelText('Demo content notice'));
  });

  it('explains the late-join flow when a room is already mid-match', async () => {
    const lookupRoom = vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'round',
          match: {
            phaseEndsAt: Date.now() + 3_000,
            currentTurn: {
              turnNumber: 1,
              totalTurns: 3,
              drawerPlayerId: 'host-1',
              drawerNickname: 'Host',
              prompt: null,
              promptVisibility: 'hidden',
              referenceArtUrl: '/demo-assets/Archer.svg',
              rerollsRemaining: 1,
              rerolledFrom: null,
              correctGuessPlayerIds: [],
              drawing: buildDrawingState(),
            },
            completedTurns: [],
            chatMessages: [],
            scoreboard: [
              {
                playerId: 'host-1',
                nickname: 'Host',
                score: 0,
              },
              {
                playerId: 'guest-1',
                nickname: 'Guest',
                score: 0,
              },
            ],
          },
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: null,
            joinedSession: null,
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom,
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Room ABCDEF' })).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'A match is already in progress. Join now to appear on the live scoreboard, guess right away when a round is active, and draw in each remaining round.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('main').lastElementChild).toBe(screen.getByLabelText('Demo content notice'));
  });

  it('shows reconnecting players and only enables start when enough connected players are present', async () => {
    const updateLobbySettings = vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'lobby',
                match: null,
          settings: {
            roundTimerSeconds: 120,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 5,
            artEnabled: false,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: false,
              reconnectBy: Date.now() + 30_000,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'lobby',
                        match: null,
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 3,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: false,
                  reconnectBy: Date.now() + 30_000,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings,
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Room Code:')).toBeInTheDocument();
    expect(screen.getByText('ABCDEF')).toBeInTheDocument();
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: GAME_WEB_CONFIG.ui.copy.room.startGameButton })).toBeDisabled();

    const timerSelect = screen.getByLabelText(GAME_WEB_CONFIG.ui.copy.settings.roundTimerLabel);
    fireEvent.change(timerSelect, { target: { value: '120' } });

    await waitFor(() => {
      expect(updateLobbySettings).toHaveBeenCalledWith('ABCDEF', {
        roundTimerSeconds: 120,
        firstCorrectGuessTimeCapSeconds: 30,
        guessingDelaySeconds: 0,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['troop', 'building', 'spell'],
      });
    });
  });

  it('filters first-correct-guess timer options by the round timer and clamps the saved value when needed', async () => {
    const updateLobbySettings = vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'lobby',
                match: null,
          settings: {
            roundTimerSeconds: 60,
            firstCorrectGuessTimeCapSeconds: 60,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'lobby',
                        match: null,
              settings: {
                roundTimerSeconds: 120,
                firstCorrectGuessTimeCapSeconds: 90,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings,
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    const firstCorrectGuessSelect = screen.getByLabelText(GAME_WEB_CONFIG.ui.copy.settings.firstCorrectGuessTimeCapLabel) as HTMLSelectElement;
    expect(Array.from(firstCorrectGuessSelect.options, (option) => option.value)).toEqual(['15', '30', '45', '60', '75', '90', '105', '120']);
    expect(Array.from(firstCorrectGuessSelect.options, (option) => option.textContent)).toContain('120s (none)');
    expect(firstCorrectGuessSelect).toHaveValue('90');

    fireEvent.change(screen.getByLabelText(GAME_WEB_CONFIG.ui.copy.settings.roundTimerLabel), { target: { value: '60' } });

    await waitFor(() => {
      expect(updateLobbySettings).toHaveBeenCalledWith('ABCDEF', {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 60,
        guessingDelaySeconds: 0,
        turnsPerPlayer: 1,
        artEnabled: true,
        enabledCollectionIds: ['troop', 'building', 'spell'],
      });
    });

    expect(Array.from(firstCorrectGuessSelect.options, (option) => option.value)).toEqual(['15', '30', '45', '60']);
    expect(firstCorrectGuessSelect).toHaveValue('60');
  });

  it('lets the host configure the guessing delay', async () => {
    const updateLobbySettings = vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'lobby',
                match: null,
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            guessingDelaySeconds: 5,
            turnsPerPlayer: 3,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'lobby',
                        match: null,
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 3,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings,
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(GAME_WEB_CONFIG.ui.copy.settings.guessingDelayLabel), { target: { value: '5' } });

    await waitFor(() => {
      expect(updateLobbySettings).toHaveBeenCalledWith('ABCDEF', {
        roundTimerSeconds: 90,
        firstCorrectGuessTimeCapSeconds: 30,
        guessingDelaySeconds: 5,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['troop', 'building', 'spell'],
      });
    });
  });

  it('lets the host narrow the prompt pool by collection', async () => {
    const updateLobbySettings = vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'lobby',
                match: null,
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            guessingDelaySeconds: 0,
            turnsPerPlayer: 3,
            artEnabled: true,
            enabledCollectionIds: ['spell', 'building'],
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'lobby',
                        match: null,
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                guessingDelaySeconds: 0,
                turnsPerPlayer: 3,
                artEnabled: true,
                enabledCollectionIds: ['troop', 'building', 'spell'],
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings,
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText(GAME_DEFINITION.terminology.collectionPlural, { exact: false })).toBeInTheDocument();
    for (const collection of GAME_DEFINITION.promptCatalog.collections) {
      expect(screen.getByRole('checkbox', { name: new RegExp(collection.name, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByText(GAME_DEFINITION.terminology.referenceArtLabel, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Characters/i }));

    await waitFor(() => {
      expect(updateLobbySettings).toHaveBeenCalledWith('ABCDEF', {
        roundTimerSeconds: 90,
        firstCorrectGuessTimeCapSeconds: 30,
        guessingDelaySeconds: 0,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['building', 'spell'],
      });
    });
  });

  it('shows host kick controls in the lobby and submits the selected player id', async () => {
    const kickPlayer = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        kickedPlayerId: 'guest-1',
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'lobby',
                match: null,
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 3,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'lobby',
                        match: null,
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 3,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer,
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kick' }));

    await waitFor(() => {
      expect(kickPlayer).toHaveBeenCalledWith('ABCDEF', 'guest-1');
    });
  });

  it('shows the active drawer prompt and drawing controls during the match slice', async () => {
    const rerollTurn = vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'round',
          match: {
            phaseEndsAt: Date.now() + 3_000,
            currentTurn: {
              turnNumber: 1,
              totalTurns: 2,
              drawerPlayerId: 'host-1',
              drawerNickname: 'Host',
              prompt: 'Arrows',
              promptVisibility: 'assigned',
              referenceArtUrl: '/demo-assets/Arrows.svg',
              rerollsRemaining: 0,
              rerolledFrom: 'Archer',
              correctGuessPlayerIds: [],
              drawing: buildDrawingState(),
            },
            completedTurns: [],
            chatMessages: [],
            scoreboard: [
              {
                playerId: 'host-1',
                nickname: 'Host',
                score: 50,
              },
              {
                playerId: 'guest-1',
                nickname: 'Guest',
                score: 25,
              },
            ],
          },
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });
    const submitDrawingAction = vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        roomCode: 'ABCDEF',
        revision: 1,
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'round',
              match: {
                phaseEndsAt: Date.now() + 3_000,
                currentTurn: {
                  turnNumber: 1,
                  totalTurns: 2,
                  drawerPlayerId: 'host-1',
                  drawerNickname: 'Host',
                  prompt: 'Archer',
                  promptVisibility: 'assigned',
                  referenceArtUrl: '/demo-assets/Archer.svg',
                  rerollsRemaining: 1,
                  rerolledFrom: null,
                  correctGuessPlayerIds: [],
                  drawing: buildDrawingState(),
                },
                completedTurns: [],
                chatMessages: [
                  {
                    id: 'message-1',
                    senderPlayerId: 'guest-1',
                    senderNickname: 'Guest',
                    kind: 'message',
                    text: 'hog maybe?',
                    createdAt: Date.now(),
                  },
                ],
                scoreboard: [
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 50,
                  },
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 25,
                  },
                ],
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn,
            submitDrawingAction,
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Archer')).toBeInTheDocument();
    expect(screen.getByAltText('Reference sketch for Archer')).toBeInTheDocument();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
    expect(screen.getByTitle('Redo (Ctrl+Shift+Z / Ctrl+Y)')).toBeDisabled();

    fireEvent.click(screen.getByText(/Reroll prompt/));
    fireEvent.click(screen.getByTitle('Clear'));

    await waitFor(() => {
      expect(rerollTurn).toHaveBeenCalledWith('ABCDEF');
      expect(submitDrawingAction).toHaveBeenCalledWith('ABCDEF', { type: 'clear' });
    });
  });

  it('enables redo after an undoable drawing action has been undone', async () => {
    const submitDrawingAction = vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        roomCode: 'ABCDEF',
        revision: 1,
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
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
                  prompt: 'Archer',
                  promptVisibility: 'assigned',
                  referenceArtUrl: 'https://cdn.example/hog-rider.png',
                  rerollsRemaining: 1,
                  rerolledFrom: null,
                  correctGuessPlayerIds: [],
                  drawing: buildDrawingState({
                    undoneOperations: [
                      {
                        kind: 'clear',
                        id: 'operation-1',
                      },
                    ],
                  }),
                },
                completedTurns: [],
                chatMessages: [],
                scoreboard: [
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 0,
                  },
                ],
              },
              lobbyDrawing: null,
                        settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 2,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
              ],
            },
            connectionNotice: null,
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitDrawingAction,
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    const redoButton = screen.getByTitle('Redo (Ctrl+Shift+Z / Ctrl+Y)');
    expect(redoButton).toBeEnabled();

    fireEvent.click(redoButton);

    await waitFor(() => {
      expect(submitDrawingAction).toHaveBeenCalledWith('ABCDEF', { type: 'redo' });
    });
  });

  it('keeps the chat input focused after sending a message', async () => {
    let resolveSubmitMessage: ((result: ApiResult<SubmitMessageSuccess>) => void) | null = null;
    const submitRoomMessage = vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmitMessage = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'round',
              match: {
                phaseEndsAt: Date.now() + 3_000,
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
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 0,
                  },
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 0,
                  },
                ],
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'guest-1',
              roomCode: 'ABCDEF',
              nickname: 'Guest',
              sessionToken: 'session-2',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitRoomMessage,
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText('Type your guess…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'hog rider' } });
    fireEvent.click(screen.getByRole('button', { name: GAME_WEB_CONFIG.ui.skin.tokens.icons.sendMessage }));

    expect(submitRoomMessage).toHaveBeenCalledWith('ABCDEF', 'hog rider');
    expect(input).toHaveValue('');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });

    resolveSubmitMessage?.({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'round',
          match: {
            phaseEndsAt: Date.now() + 3_000,
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
              {
                playerId: 'guest-1',
                nickname: 'Guest',
                score: 0,
              },
              {
                playerId: 'host-1',
                nickname: 'Host',
                score: 0,
              },
            ],
          },
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it('auto-scrolls the room feed when a new message is appended and the viewer is near the bottom', async () => {
    let scrollHeight = 120;
    const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const buildRoom = (chatMessages: Array<{ id: string; senderPlayerId: string; senderNickname: string; kind: 'chat'; text: string; createdAt: number }>) => ({
      code: 'ABCDEF',
      shareUrl: 'https://sketcherson.example/room/ABCDEF',
      status: 'round' as const,
      match: {
        phaseEndsAt: Date.now() + 3_000,
        currentTurn: {
          turnNumber: 1,
          totalTurns: 2,
          drawerPlayerId: 'host-1',
          drawerNickname: 'Host',
          prompt: null,
          promptVisibility: 'hidden' as const,
          rerollsRemaining: 1,
          rerolledFrom: null,
          correctGuessPlayerIds: [],
          drawing: buildDrawingState(),
        },
        completedTurns: [],
        chatMessages,
        scoreboard: [
          {
            playerId: 'guest-1',
            nickname: 'Guest',
            score: 0,
          },
          {
            playerId: 'host-1',
            nickname: 'Host',
            score: 0,
          },
        ],
      },
      settings: {
        roundTimerSeconds: 90,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      players: [
        {
          id: 'host-1',
          nickname: 'Host',
          connected: true,
          reconnectBy: null,
          isHost: true,
        },
        {
          id: 'guest-1',
          nickname: 'Guest',
          connected: true,
          reconnectBy: null,
          isHost: false,
        },
      ],
    });
    const renderRoomPage = (chatMessages: Array<{ id: string; senderPlayerId: string; senderNickname: string; kind: 'chat'; text: string; createdAt: number }>) => (
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: buildRoom(chatMessages),
            joinedSession: {
              playerId: 'guest-1',
              roomCode: 'ABCDEF',
              nickname: 'Guest',
              sessionToken: 'session-2',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>
    );

    const initialMessages = [
      {
        id: 'message-1',
        senderPlayerId: 'guest-1',
        senderNickname: 'Guest',
        kind: 'chat' as const,
        text: 'first guess',
        createdAt: Date.now(),
      },
    ];
    const { rerender } = render(renderRoomPage(initialMessages));
    const feed = screen.getByLabelText('Room feed messages');

    feed.scrollTop = 18;
    fireEvent.scroll(feed);
    scrollHeight = 240;

    rerender(
      renderRoomPage([
        ...initialMessages,
        {
          id: 'message-2',
          senderPlayerId: 'host-1',
          senderNickname: 'Host',
          kind: 'chat',
          text: 'second guess',
          createdAt: Date.now() + 1,
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Room feed messages').scrollTop).toBe(240);
    });

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it('keeps the room feed position when a new message is appended and the viewer scrolled up', async () => {
    let scrollHeight = 160;
    const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const buildRoom = (chatMessages: Array<{ id: string; senderPlayerId: string; senderNickname: string; kind: 'chat'; text: string; createdAt: number }>) => ({
      code: 'ABCDEF',
      shareUrl: 'https://sketcherson.example/room/ABCDEF',
      status: 'round' as const,
      match: {
        phaseEndsAt: Date.now() + 3_000,
        currentTurn: {
          turnNumber: 1,
          totalTurns: 2,
          drawerPlayerId: 'host-1',
          drawerNickname: 'Host',
          prompt: null,
          promptVisibility: 'hidden' as const,
          rerollsRemaining: 1,
          rerolledFrom: null,
          correctGuessPlayerIds: [],
          drawing: buildDrawingState(),
        },
        completedTurns: [],
        chatMessages,
        scoreboard: [
          {
            playerId: 'guest-1',
            nickname: 'Guest',
            score: 0,
          },
          {
            playerId: 'host-1',
            nickname: 'Host',
            score: 0,
          },
        ],
      },
      settings: {
        roundTimerSeconds: 90,
        firstCorrectGuessTimeCapSeconds: 30,
        turnsPerPlayer: 1,
        artEnabled: true,
      },
      players: [
        {
          id: 'host-1',
          nickname: 'Host',
          connected: true,
          reconnectBy: null,
          isHost: true,
        },
        {
          id: 'guest-1',
          nickname: 'Guest',
          connected: true,
          reconnectBy: null,
          isHost: false,
        },
      ],
    });
    const renderRoomPage = (chatMessages: Array<{ id: string; senderPlayerId: string; senderNickname: string; kind: 'chat'; text: string; createdAt: number }>) => (
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: buildRoom(chatMessages),
            joinedSession: {
              playerId: 'guest-1',
              roomCode: 'ABCDEF',
              nickname: 'Guest',
              sessionToken: 'session-2',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>
    );

    const initialMessages = [
      {
        id: 'message-1',
        senderPlayerId: 'guest-1',
        senderNickname: 'Guest',
        kind: 'chat' as const,
        text: 'first guess',
        createdAt: Date.now(),
      },
    ];
    const { rerender } = render(renderRoomPage(initialMessages));
    const feed = screen.getByLabelText('Room feed messages');

    feed.scrollTop = 0;
    fireEvent.scroll(feed);
    scrollHeight = 260;

    rerender(
      renderRoomPage([
        ...initialMessages,
        {
          id: 'message-2',
          senderPlayerId: 'host-1',
          senderNickname: 'Host',
          kind: 'chat',
          text: 'second guess',
          createdAt: Date.now() + 1,
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Room feed messages').scrollTop).toBe(0);
    });

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it('locks chat for guessers while the round delay is active', () => {
    const submitRoomMessage = vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>();

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'round',
              match: {
                phaseEndsAt: Date.now() + 60_000,
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
                  guessingDelayRemainingMs: 5_000,
                  drawing: buildDrawingState(),
                },
                completedTurns: [],
                chatMessages: [],
                scoreboard: [
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 0,
                  },
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 0,
                  },
                ],
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                guessingDelaySeconds: 5,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'guest-1',
              roomCode: 'ABCDEF',
              nickname: 'Guest',
              sessionToken: 'session-2',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitRoomMessage,
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Wait 5s')).toBeInTheDocument();
    expect(screen.getByText('Guessing opens in 5s.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Guessing opens in 5s…')).toBeDisabled();
    expect(screen.getByText(GAME_WEB_CONFIG.ui.skin.tokens.icons.sendMessage).closest('button')).toBeDisabled();
    expect(submitRoomMessage).not.toHaveBeenCalled();
  });

  it('shows the live scoreboard and locks chat after the viewer guessed correctly', async () => {
    const submitRoomMessage = vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>();

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'round',
              match: {
                phaseEndsAt: Date.now() + 3_000,
                currentTurn: {
                  turnNumber: 1,
                  totalTurns: 2,
                  drawerPlayerId: 'host-1',
                  drawerNickname: 'Host',
                  prompt: null,
                  promptVisibility: 'hidden',
                  rerollsRemaining: 1,
                  rerolledFrom: null,
                  correctGuessPlayerIds: ['guest-1'],
                  drawing: buildDrawingState(),
                },
                completedTurns: [],
                feed: [
                  {
                    id: 'message-1',
                    type: 'correctGuess',
                    visibility: 'self',
                    guesserPlayerId: null,
                    guesserNickname: null,
                    answer: 'Archer',
                    createdAt: Date.now(),
                    turnNumber: 1,
                  },
                ],
                chatMessages: [],
                scoreboard: [
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 100,
                  },
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 50,
                  },
                ],
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'guest-1',
              roomCode: 'ABCDEF',
              nickname: 'Guest',
              sessionToken: 'session-2',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
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
            submitRoomMessage,
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('You were correct! The prompt was Archer.')).toBeInTheDocument();
    expect(screen.getByText('Guessed')).toBeInTheDocument();
    expect(screen.getByText(GAME_WEB_CONFIG.ui.skin.tokens.icons.sendMessage).closest('button')).toBeDisabled();
    expect(submitRoomMessage).not.toHaveBeenCalled();
  });

  it('shows pause controls for the host and lets the room resume from a paused match', async () => {
    const resumeRoom = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'paused',
          match: {
            phaseEndsAt: null,
            currentTurn: {
              turnNumber: 1,
              totalTurns: 2,
              drawerPlayerId: 'host-1',
              drawerNickname: 'Host',
              prompt: 'Knight',
              promptVisibility: 'assigned',
              rerollsRemaining: 1,
              rerolledFrom: null,
              correctGuessPlayerIds: [],
              drawing: buildDrawingState(),
            },
            completedTurns: [],
            chatMessages: [],
            scoreboard: [
              {
                playerId: 'host-1',
                nickname: 'Host',
                score: 0,
              },
              {
                playerId: 'guest-1',
                nickname: 'Guest',
                score: 0,
              },
            ],
            pause: {
              mode: 'resuming',
              pausedPhase: 'round',
              phaseRemainingMs: 42_000,
              pauseEndsAt: null,
              resumeEndsAt: Date.now() + 3_000,
            },
          },
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: false,
              reconnectBy: null,
              reconnectRemainingMs: 60_000,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'paused',
              match: {
                phaseEndsAt: null,
                currentTurn: {
                  turnNumber: 1,
                  totalTurns: 2,
                  drawerPlayerId: 'host-1',
                  drawerNickname: 'Host',
                  prompt: 'Knight',
                  promptVisibility: 'assigned',
                  rerollsRemaining: 1,
                  rerolledFrom: null,
                  correctGuessPlayerIds: [],
                  drawing: buildDrawingState(),
                },
                completedTurns: [],
                chatMessages: [],
                scoreboard: [
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 0,
                  },
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 0,
                  },
                ],
                pause: {
                  mode: 'paused',
                  pausedPhase: 'round',
                  phaseRemainingMs: 42_000,
                  pauseEndsAt: Date.now() + 30_000,
                  resumeEndsAt: null,
                },
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: false,
                  reconnectBy: null,
                  reconnectRemainingMs: 60_000,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
            pauseRoom: vi.fn(),
            resumeRoom,
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Paused').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Auto-resumes when pause limit is reached/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume match' }));

    await waitFor(() => {
      expect(resumeRoom).toHaveBeenCalledWith('ABCDEF');
    });
  });

  it('shows final standings above the round gallery and lets the host start a rematch', async () => {
    const startRoom = vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>().mockResolvedValue({
      ok: true,
      data: {
        room: {
          code: 'ABCDEF',
          shareUrl: 'https://sketcherson.example/room/ABCDEF',
          status: 'countdown',
          match: {
            phaseEndsAt: Date.now() + 3_000,
            currentTurn: {
              turnNumber: 1,
              totalTurns: 2,
              drawerPlayerId: 'host-1',
              drawerNickname: 'Host',
              prompt: 'Knight',
              promptVisibility: 'assigned',
              rerollsRemaining: 1,
              rerolledFrom: null,
              correctGuessPlayerIds: [],
              drawing: buildDrawingState(),
            },
            completedTurns: [],
            chatMessages: [],
            scoreboard: [
              {
                playerId: 'host-1',
                nickname: 'Host',
                score: 0,
              },
              {
                playerId: 'guest-1',
                nickname: 'Guest',
                score: 0,
              },
            ],
          },
          settings: {
            roundTimerSeconds: 90,
            firstCorrectGuessTimeCapSeconds: 30,
            turnsPerPlayer: 1,
            artEnabled: true,
          },
          players: [
            {
              id: 'host-1',
              nickname: 'Host',
              connected: true,
              reconnectBy: null,
              isHost: true,
            },
            {
              id: 'guest-1',
              nickname: 'Guest',
              connected: true,
              reconnectBy: null,
              isHost: false,
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <RoomSessionContext.Provider
          value={{
            activeRoom: {
              code: 'ABCDEF',
              shareUrl: 'https://sketcherson.example/room/ABCDEF',
              status: 'postgame',
              match: {
                phaseEndsAt: null,
                currentTurn: null,
                completedTurns: [
                  {
                    turnNumber: 1,
                    drawerPlayerId: 'host-1',
                    drawerNickname: 'Host',
                    answer: 'Knight',
                    rerolledFrom: null,
                    finalImageDataUrl: 'data:image/png;base64,AAAA',
                    scoreChanges: [
                      {
                        playerId: 'host-1',
                        nickname: 'Host',
                        points: 50,
                        reason: 'drawer',
                      },
                    ],
                  },
                  {
                    turnNumber: 2,
                    drawerPlayerId: 'guest-1',
                    drawerNickname: 'Guest',
                    answer: 'Dragon',
                    rerolledFrom: 'Archer',
                    finalImageDataUrl: 'data:image/png;base64,BBBB',
                    scoreChanges: [
                      {
                        playerId: 'guest-1',
                        nickname: 'Guest',
                        points: 50,
                        reason: 'drawer',
                      },
                    ],
                  },
                ],
                chatMessages: [],
                scoreboard: [
                  {
                    playerId: 'guest-1',
                    nickname: 'Guest',
                    score: 150,
                  },
                  {
                    playerId: 'host-1',
                    nickname: 'Host',
                    score: 100,
                  },
                ],
              },
              settings: {
                roundTimerSeconds: 90,
                firstCorrectGuessTimeCapSeconds: 30,
                turnsPerPlayer: 1,
                artEnabled: true,
              },
              players: [
                {
                  id: 'host-1',
                  nickname: 'Host',
                  connected: true,
                  reconnectBy: null,
                  isHost: true,
                },
                {
                  id: 'guest-1',
                  nickname: 'Guest',
                  connected: true,
                  reconnectBy: null,
                  isHost: false,
                },
              ],
            },
            joinedSession: {
              playerId: 'host-1',
              roomCode: 'ABCDEF',
              nickname: 'Host',
              sessionToken: 'session-1',
            },
            sessionRecoveryError: null,
            roomExitNotice: null,
            createRoom: vi.fn(),
            joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
            reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>().mockResolvedValue(null),
            lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
            updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
            startRoom,
            pauseRoom: vi.fn(),
            resumeRoom: vi.fn(),
            kickPlayer: vi.fn(),
            rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
            submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
            submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
          }}
        >
          <Routes>
            <Route path="/room/:code" element={<RoomPage />} />
          </Routes>
        </RoomSessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText(GAME_WEB_CONFIG.ui.copy.room.finalStandingsHeader)).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByAltText('Drawing of Dragon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: GAME_WEB_CONFIG.ui.copy.room.playAgainButton }));

    await waitFor(() => {
      expect(startRoom).toHaveBeenCalledWith('ABCDEF');
    });
  });
});
