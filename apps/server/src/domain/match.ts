import type { GameDefinition } from '@sketcherson/common/game';
import { createPromptEngine, type PromptEntry } from '@sketcherson/common/prompts';
import type { LobbySettings } from '@sketcherson/common/room';

export { appendTailTurn, buildTurnPlan, type PlannedTurn } from './roomRuntime/turnPlan';

/**
 * Compatibility helper for older tests and call sites. Runtime prompt assignment should use PromptEngine directly.
 */
export function pickRandomGamePrompt<TPrompt extends PromptEntry>(
  gameDefinition: GameDefinition<TPrompt>,
  settings: LobbySettings,
  random: () => number = Math.random,
  excludedPromptIds?: Set<string> | string,
): TPrompt {
  return createPromptEngine({ definition: gameDefinition }).assign({
    collectionIds: settings.enabledCollectionIds,
    usedPromptIds: excludedPromptIds,
    random,
  }).prompt;
}
