import { describe, expect, it } from 'vitest';
import { createRoomFeedProjector } from '../src/domain/roomRuntime/RoomFeedProjector';
import type { RoomFeedRecord } from '../src/domain/roomRuntime/model';

const projector = createRoomFeedProjector();

describe('RoomFeedProjector', () => {
  it('projects semantic lobby and match feed items without formatted text', () => {
    const records: RoomFeedRecord[] = [
      {
        id: 'join-1',
        type: 'system',
        event: { type: 'playerJoined', nickname: 'Host' },
        createdAt: 100,
        turnNumber: null,
      },
      {
        id: 'chat-1',
        type: 'playerChat',
        senderPlayerId: 'player-1',
        senderNickname: 'Host',
        text: 'hello',
        createdAt: 101,
        turnNumber: null,
      },
    ];

    expect(projector.projectLobbyFeed({ records })).toEqual([
      {
        id: 'join-1',
        type: 'system',
        event: { type: 'playerJoined', nickname: 'Host' },
        createdAt: 100,
        turnNumber: null,
      },
      {
        id: 'chat-1',
        type: 'playerChat',
        senderPlayerId: 'player-1',
        senderNickname: 'Host',
        text: 'hello',
        createdAt: 101,
        turnNumber: null,
      },
    ]);

    expect(JSON.stringify(projector.projectMatchFeed({ records }))).not.toContain('joined the lobby');
  });

  it('filters audience-targeted feed records at the server boundary', () => {
    const records: RoomFeedRecord[] = [
      {
        id: 'close-1',
        type: 'system',
        event: { type: 'closeGuess', guesserNickname: 'Guesser', message: 'One letter off.' },
        createdAt: 150,
        turnNumber: 2,
        audiencePlayerIds: ['player-2'],
      },
    ];

    expect(projector.projectMatchFeed({ records, viewerPlayerId: 'player-2' })).toHaveLength(1);
    expect(projector.projectMatchFeed({ records, viewerPlayerId: 'player-3' })).toEqual([]);
  });

  it('projects correct guesses with viewer-specific answer privacy', () => {
    const records: RoomFeedRecord[] = [
      {
        id: 'correct-1',
        type: 'correctGuess',
        guesserPlayerId: 'player-2',
        guesserNickname: 'Guesser',
        answer: 'Goblin Barrel',
        guessPosition: 1,
        totalGuessers: 3,
        createdAt: 200,
        turnNumber: 4,
      },
    ];

    expect(projector.projectMatchFeed({ records, viewerPlayerId: 'player-2' })).toEqual([
      {
        id: 'correct-1',
        type: 'correctGuess',
        visibility: 'self',
        guesserPlayerId: null,
        guesserNickname: null,
        answer: 'Goblin Barrel',
        guessPosition: 1,
        totalGuessers: 3,
        createdAt: 200,
        turnNumber: 4,
      },
    ]);

    expect(projector.projectMatchFeed({ records, viewerPlayerId: 'player-3' })).toEqual([
      {
        id: 'correct-1',
        type: 'correctGuess',
        visibility: 'others',
        guesserPlayerId: 'player-2',
        guesserNickname: 'Guesser',
        createdAt: 200,
        turnNumber: 4,
      },
    ]);
  });
});
