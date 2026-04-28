import { MAX_TOTAL_TURNS } from '@sketcherson/common/room';

export interface PlannedTurn {
  turnNumber: number;
  drawerPlayerId: string;
}

export function buildTurnPlan(
  playerIds: string[],
  turnsPerPlayer: number,
  random: () => number = Math.random,
  maxTotalTurns = MAX_TOTAL_TURNS,
): PlannedTurn[] {
  const fixedOrder = shuffle(playerIds, random);
  const turnPlan: PlannedTurn[] = [];

  for (let cycle = 0; cycle < turnsPerPlayer; cycle += 1) {
    for (const drawerPlayerId of fixedOrder) {
      if (turnPlan.length >= maxTotalTurns) {
        return turnPlan;
      }

      turnPlan.push({
        turnNumber: turnPlan.length + 1,
        drawerPlayerId,
      });
    }
  }

  return turnPlan;
}

export function appendTailTurn(
  turnPlan: PlannedTurn[],
  drawerPlayerId: string,
  maxTotalTurns = MAX_TOTAL_TURNS,
): PlannedTurn[] {
  if (turnPlan.length >= maxTotalTurns) {
    return turnPlan;
  }

  return [
    ...turnPlan,
    {
      turnNumber: turnPlan.length + 1,
      drawerPlayerId,
    },
  ];
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const value = copy[index];
    copy[index] = copy[swapIndex] as T;
    copy[swapIndex] = value as T;
  }

  return copy;
}
