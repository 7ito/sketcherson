import type { GameDefinition } from './gameDefinition';
import { createPromptEngine } from './promptEngine';
import type { PromptEntry } from './promptCatalog';

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds(). */
export function getDefaultEnabledPromptCollectionIds(gameDefinition: GameDefinition): string[] {
  return createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds();
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds(collectionIds). */
export function normalizeEnabledPromptCollectionIds(
  gameDefinition: GameDefinition,
  collectionIds?: readonly string[] | null,
): string[] {
  return createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds(collectionIds);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).areCollectionIdsValid(collectionIds). */
export function areEnabledPromptCollectionIdsValid(
  gameDefinition: GameDefinition,
  collectionIds?: readonly string[] | null,
): boolean {
  return createPromptEngine({ definition: gameDefinition }).areCollectionIdsValid(collectionIds);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).getEnabledPrompts(collectionIds). */
export function getEnabledPrompts<TPrompt extends PromptEntry>(
  gameDefinition: GameDefinition<TPrompt>,
  collectionIds?: readonly string[] | null,
): TPrompt[] {
  return createPromptEngine({ definition: gameDefinition }).getEnabledPrompts(collectionIds);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).getPromptById(promptId). */
export function getGamePromptById<TPrompt extends PromptEntry>(gameDefinition: GameDefinition<TPrompt>, promptId: string): TPrompt | null {
  return createPromptEngine({ definition: gameDefinition }).getPromptById(promptId);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).getPromptByName(promptName). */
export function getGamePromptByName<TPrompt extends PromptEntry>(gameDefinition: GameDefinition<TPrompt>, promptName: string): TPrompt | null {
  return createPromptEngine({ definition: gameDefinition }).getPromptByName(promptName);
}

/** @deprecated Prefer createPromptEngine(gamePack).getReferenceArtUrl(promptId). */
export function getOfficialPromptArtUrl(gameDefinition: GameDefinition, promptName: string): string | null {
  const promptEngine = createPromptEngine({ definition: gameDefinition });
  const prompt = promptEngine.getPromptByName(promptName);
  return prompt ? promptEngine.getReferenceArtUrl(prompt.id) : null;
}

/** @deprecated Prefer createPromptEngine(gamePack).getReferenceArtUrl(promptId). */
export function getOfficialPromptArtUrlById(gameDefinition: GameDefinition, promptId: string): string | null {
  return createPromptEngine({ definition: gameDefinition }).getReferenceArtUrl(promptId);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).isCorrectGuess(promptId, guess). */
export function isCorrectGuessForGamePromptId(gameDefinition: GameDefinition, promptId: string, guess: string): boolean {
  return createPromptEngine({ definition: gameDefinition }).isCorrectGuess(promptId, guess);
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).evaluateGuess(promptId, guess). */
export function isCorrectGuessForGamePromptName(gameDefinition: GameDefinition, promptName: string, guess: string): boolean {
  const promptEngine = createPromptEngine({ definition: gameDefinition });
  const prompt = promptEngine.getPromptByName(promptName);
  return prompt ? promptEngine.isCorrectGuess(prompt.id, guess) : false;
}

/** @deprecated Prefer createPromptEngine({ definition: gameDefinition }).getFallbackPrompt(). */
export function getGameFallbackPrompt<TPrompt extends PromptEntry>(gameDefinition: GameDefinition<TPrompt>): TPrompt {
  return createPromptEngine({ definition: gameDefinition }).getFallbackPrompt();
}
