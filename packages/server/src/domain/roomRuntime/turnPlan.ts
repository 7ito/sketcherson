import { MAX_TOTAL_TURNS } from '@7ito/sketcherson-common/room';

export interface PlannedTurn {
  turnNumber: number;
  roundNumber: number;
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
        roundNumber: cycle + 1,
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
  roundNumber = (turnPlan.at(-1)?.roundNumber ?? 0) + 1,
): PlannedTurn[] {
  if (turnPlan.length >= maxTotalTurns) {
    return turnPlan;
  }

  return [
    ...turnPlan,
    {
      turnNumber: turnPlan.length + 1,
      roundNumber,
      drawerPlayerId,
    },
  ];
}

export function addPlayerTurnsForRounds(
  turnPlan: PlannedTurn[],
  drawerPlayerId: string,
  firstRoundNumber: number,
  lastRoundNumber: number,
  maxTotalTurns = MAX_TOTAL_TURNS,
): PlannedTurn[] {
  if (firstRoundNumber > lastRoundNumber || turnPlan.length >= maxTotalTurns) {
    return turnPlan;
  }

  let updatedTurnPlan = [...turnPlan];

  for (let roundNumber = firstRoundNumber; roundNumber <= lastRoundNumber; roundNumber += 1) {
    if (updatedTurnPlan.length >= maxTotalTurns) {
      break;
    }

    if (updatedTurnPlan.some((turn) => turn.roundNumber === roundNumber && turn.drawerPlayerId === drawerPlayerId)) {
      continue;
    }

    const insertIndex = findRoundInsertIndex(updatedTurnPlan, roundNumber);
    if (insertIndex === null) {
      continue;
    }

    updatedTurnPlan = [
      ...updatedTurnPlan.slice(0, insertIndex),
      {
        turnNumber: 0,
        roundNumber,
        drawerPlayerId,
      },
      ...updatedTurnPlan.slice(insertIndex),
    ];
  }

  return reindexTurnNumbers(updatedTurnPlan);
}

function findRoundInsertIndex(turnPlan: PlannedTurn[], roundNumber: number): number | null {
  for (let index = turnPlan.length - 1; index >= 0; index -= 1) {
    if (turnPlan[index]?.roundNumber === roundNumber) {
      return index + 1;
    }
  }

  return null;
}

function reindexTurnNumbers(turnPlan: PlannedTurn[]): PlannedTurn[] {
  return turnPlan.map((turn, index) => ({
    ...turn,
    turnNumber: index + 1,
  }));
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
