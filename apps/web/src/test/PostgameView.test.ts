import { describe, expect, it } from 'vitest';
import type { CompletedTurnState } from '@sketcherson/common/room';
import { groupCompletedTurnsForPostgame } from '../components/room-page/PostgameView';

const buildTurn = (turnNumber: number, drawerNickname = `Player ${turnNumber}`): CompletedTurnState => ({
  turnNumber,
  drawerPlayerId: `player-${turnNumber}`,
  drawerNickname,
  answer: `Prompt ${turnNumber}`,
  rerolledFrom: null,
  finalImageDataUrl: `data:image/png;base64,${turnNumber}`,
  scoreChanges: [],
});

describe('groupCompletedTurnsForPostgame', () => {
  it('keeps late join tail turns visible when older room states do not include round numbers', () => {
    const turns = Array.from({ length: 7 }, (_value, index) => buildTurn(index + 1));

    const rounds = groupCompletedTurnsForPostgame(turns, 3);

    expect(rounds.flatMap((round) => round.turns.map((turn) => turn.drawerNickname))).toEqual([
      'Player 1',
      'Player 2',
      'Player 3',
      'Player 4',
      'Player 5',
      'Player 6',
      'Player 7',
    ]);
  });

  it('uses server round numbers so late tail turns can render as a bonus round', () => {
    const turns = [
      { ...buildTurn(1, 'Host'), roundNumber: 1 },
      { ...buildTurn(2, 'Guest'), roundNumber: 1 },
      { ...buildTurn(3, 'Late'), roundNumber: 2 },
    ];

    const rounds = groupCompletedTurnsForPostgame(turns, 1);

    expect(rounds).toEqual([
      { roundNumber: 1, turns: [turns[0], turns[1]] },
      { roundNumber: 2, turns: [turns[2]] },
    ]);
  });
});
