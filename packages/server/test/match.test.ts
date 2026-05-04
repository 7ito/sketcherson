import { describe, expect, it } from 'vitest';
import { defaultLobbySettingsForGame } from '@7ito/sketcherson-common/settings';
import { MAX_TOTAL_TURNS } from '@7ito/sketcherson-common/room';
import { DEMO_GAME_DEFINITION } from '@sketcherson/demo-game';
import { appendTailTurn, buildTurnPlan, pickRandomGamePrompt } from '../src/domain/match';

describe('match planning', () => {
  it('repeats a single randomized order across all configured cycles', () => {
    const turnPlan = buildTurnPlan(['host', 'guest', 'third'], 2, () => 0);

    expect(turnPlan.map((turn) => turn.drawerPlayerId)).toEqual(['guest', 'third', 'host', 'guest', 'third', 'host']);
  });

  it('enforces the hidden total-turn safety cap', () => {
    const playerIds = Array.from({ length: 12 }, (_, index) => `player-${index + 1}`);
    const turnPlan = buildTurnPlan(playerIds, 10, () => 0.4);

    expect(turnPlan).toHaveLength(MAX_TOTAL_TURNS);
    expect(turnPlan.at(-1)?.turnNumber).toBe(MAX_TOTAL_TURNS);
  });

  it('appends late-join tail turns in join order without exceeding the cap', () => {
    const originalPlan = buildTurnPlan(['host', 'guest'], 1, () => 0, 2);
    const withFirstLateJoiner = appendTailTurn(originalPlan, 'late-1', 3);
    const withSecondLateJoiner = appendTailTurn(withFirstLateJoiner, 'late-2', 3);

    expect(withFirstLateJoiner.map((turn) => turn.drawerPlayerId)).toEqual(['guest', 'host', 'late-1']);
    expect(withFirstLateJoiner.map((turn) => turn.roundNumber)).toEqual([1, 1, 2]);
    expect(withSecondLateJoiner.map((turn) => turn.drawerPlayerId)).toEqual(['guest', 'host', 'late-1']);
    expect(withSecondLateJoiner.at(-1)?.turnNumber).toBe(3);
  });

  it('avoids rerolling to the same prompt when alternatives exist', () => {
    const rerolledPrompt = pickRandomGamePrompt(
      DEMO_GAME_DEFINITION,
      defaultLobbySettingsForGame(DEMO_GAME_DEFINITION),
      () => 0,
      'archer',
    );

    expect(rerolledPrompt.name).not.toBe('Archer');
  });
});
