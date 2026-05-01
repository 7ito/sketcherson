import type { RoomState } from '@sketcherson/common/room';
import { detectRoomAudioCues } from '../lib/roomAudio';

function buildLobbyRoom(playerIds: string[]): RoomState {
  return {
    code: 'ABCDEF',
    shareUrl: 'https://sketcherson.example/room/ABCDEF',
    status: 'lobby',
    match: null,
    lobbyDrawing: null,
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
      turnsPerPlayer: 3,
      artEnabled: true,
    },
    players: playerIds.map((playerId, index) => ({
      id: playerId,
      nickname: `Player ${index + 1}`,
      connected: true,
      reconnectBy: null,
      isHost: index === 0,
    })),
  };
}

function buildMatchRoom(turnNumber: number, correctGuessPlayerIds: string[] = []): RoomState {
  return {
    code: 'ABCDEF',
    shareUrl: 'https://sketcherson.example/room/ABCDEF',
    status: 'countdown',
    lobbyDrawing: null,
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
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
    match: {
      phaseEndsAt: Date.now() + 3_000,
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
      currentTurn: {
        turnNumber,
        totalTurns: 6,
        drawerPlayerId: 'host-1',
        drawerNickname: 'Host',
        prompt: null,
        promptVisibility: 'hidden',
        rerollsRemaining: 1,
        rerolledFrom: null,
        correctGuessPlayerIds,
        drawing: {
          width: 800,
          height: 600,
          operations: [],
          undoneOperations: [],
          activeStrokes: [],
          revision: 0,
          snapshotDataUrl: null,
        },
      },
    },
  };
}

describe('detectRoomAudioCues', () => {
  it('does not emit cues for the initial room snapshot', () => {
    expect(detectRoomAudioCues(null, buildLobbyRoom(['host-1']), 'host-1')).toEqual([]);
  });

  it('emits a lobby join cue when a new player enters the lobby', () => {
    expect(detectRoomAudioCues(buildLobbyRoom(['host-1']), buildLobbyRoom(['host-1', 'guest-1']), 'host-1')).toEqual(['lobbyJoin']);
  });

  it('emits a turn-start cue when the room moves into a fresh drawing turn', () => {
    expect(detectRoomAudioCues(buildLobbyRoom(['host-1', 'guest-1']), buildMatchRoom(1), 'host-1')).toEqual(['turnStart']);
  });

  it('emits a correct-guess cue when the current viewer becomes correct', () => {
    expect(detectRoomAudioCues(buildMatchRoom(2, []), buildMatchRoom(2, ['guest-1']), 'guest-1')).toEqual(['correctGuess']);
  });

  it('emits a distinct cue when another player becomes correct', () => {
    expect(detectRoomAudioCues(buildMatchRoom(2, []), buildMatchRoom(2, ['guest-1']), 'host-1')).toEqual(['otherPlayerCorrectGuess']);
    expect(detectRoomAudioCues(buildMatchRoom(2, ['guest-1']), buildMatchRoom(2, ['guest-1', 'host-1']), 'guest-1')).toEqual([
      'otherPlayerCorrectGuess',
    ]);
  });
});
