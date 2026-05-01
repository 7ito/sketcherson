import { describe, expect, it } from 'vitest';
import { capCompletedTurnImageRetention, COMPLETED_TURN_IMAGE_MAX_BYTES, type CompletedTurnRecord } from '../src/domain/roomRuntime/model';

function completedTurn(turnNumber: number, finalImageDataUrl: string | null): CompletedTurnRecord {
  return {
    turnNumber,
    drawerPlayerId: `drawer-${turnNumber}`,
    drawerNickname: `Drawer ${turnNumber}`,
    answer: `answer-${turnNumber}`,
    rerolledFrom: null,
    finalImageDataUrl,
    scoreChanges: [],
  };
}

describe('completed turn image retention', () => {
  it('drops oldest retained image data when completed turn snapshots exceed the memory cap', () => {
    const largeImage = `data:image/png;base64,${'a'.repeat(Math.floor(COMPLETED_TURN_IMAGE_MAX_BYTES / 2) - 64)}`;
    const completedTurns = [
      completedTurn(1, largeImage),
      completedTurn(2, largeImage),
      completedTurn(3, largeImage),
    ];

    capCompletedTurnImageRetention(completedTurns);

    expect(completedTurns.map((turn) => turn.finalImageDataUrl === null)).toEqual([true, false, false]);
  });

  it('keeps newest metadata even when its image is too large to retain', () => {
    const oversizedImage = `data:image/png;base64,${'a'.repeat(COMPLETED_TURN_IMAGE_MAX_BYTES + 1)}`;
    const completedTurns = [completedTurn(1, oversizedImage)];

    capCompletedTurnImageRetention(completedTurns);

    expect(completedTurns).toHaveLength(1);
    expect(completedTurns[0]).toMatchObject({ turnNumber: 1, finalImageDataUrl: null });
  });
});
