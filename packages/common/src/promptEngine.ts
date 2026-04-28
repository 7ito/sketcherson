import type { GamePack } from './gamePack';
import { resolveGamePackPromptArtUrl } from './gamePack';
import type { PromptCollection, PromptEntry } from './promptCatalog';
import {
  areEnabledCollectionIdsValid,
  getDefaultEnabledCollectionIds,
  getEnabledPromptEntries,
  getPromptEntryById,
  getPromptEntryByName,
  normalizeEnabledCollectionIds,
  pickRandomPromptEntry,
} from './promptCatalog';

export type PromptGuessMatchKind = 'name' | 'alias' | 'fuzzy' | 'custom';

export interface PromptGuessEvaluation {
  correct: boolean;
  matchedBy: PromptGuessMatchKind | null;
  normalizedGuess: string;
}

export interface PromptRules<TPrompt extends PromptEntry = PromptEntry> {
  normalizeGuess?: (guess: string) => string;
  evaluateGuess?: (input: {
    prompt: TPrompt;
    guess: string;
    normalizedGuess: string;
    defaultEvaluate: () => PromptGuessEvaluation;
  }) => PromptGuessEvaluation;
  selectPrompt?: (input: {
    entries: readonly TPrompt[];
    excludedPromptIds: ReadonlySet<string>;
    random: () => number;
    defaultSelect: () => TPrompt | null;
  }) => TPrompt | null;
}

export interface PromptAssignment<TPrompt extends PromptEntry = PromptEntry> {
  prompt: TPrompt;
  usedPromptIds: Set<string>;
}

export interface PromptRerollAssignment<TPrompt extends PromptEntry = PromptEntry> extends PromptAssignment<TPrompt> {
  rerolledFrom: TPrompt | null;
}

export interface PublicPrompt {
  id: string;
  name: string;
  referenceArtUrl: string | null;
}

export interface PromptEngine<TPrompt extends PromptEntry = PromptEntry> {
  getCollections(): readonly PromptCollection[];
  normalizeCollectionIds(collectionIds?: readonly string[] | null): string[];
  areCollectionIdsValid(collectionIds?: readonly string[] | null): boolean;
  getEnabledPrompts(collectionIds?: readonly string[] | null): TPrompt[];
  getPromptById(promptId: string): TPrompt | null;
  getPromptByName(promptName: string): TPrompt | null;
  getFallbackPrompt(): TPrompt;
  assign(options: {
    collectionIds?: readonly string[] | null;
    usedPromptIds?: ReadonlySet<string> | readonly string[] | string | null;
    random?: () => number;
  }): PromptAssignment<TPrompt>;
  reroll(options: {
    currentPromptId: string;
    collectionIds?: readonly string[] | null;
    usedPromptIds?: ReadonlySet<string> | readonly string[] | string | null;
    random?: () => number;
  }): PromptRerollAssignment<TPrompt>;
  evaluateGuess(promptId: string, guess: string): PromptGuessEvaluation;
  isCorrectGuess(promptId: string, guess: string): boolean;
  getReferenceArtUrl(promptId: string): string | null;
  getPublicPrompt(promptId: string): PublicPrompt | null;
}

export function createPromptEngine<TPrompt extends PromptEntry>(gamePack: GamePack<TPrompt>): PromptEngine<TPrompt> {
  const catalog = gamePack.definition.promptCatalog;
  const rules = gamePack.promptRules;

  const toExcludedPromptIdSet = (value?: ReadonlySet<string> | readonly string[] | string | null): Set<string> => {
    if (!value) {
      return new Set();
    }

    if (typeof value === 'string') {
      return new Set([value]);
    }

    return new Set(value);
  };

  const pickPrompt = (options: {
    collectionIds?: readonly string[] | null;
    usedPromptIds?: ReadonlySet<string> | readonly string[] | string | null;
    random?: () => number;
  }): TPrompt => {
    const random = options.random ?? Math.random;
    const excludedPromptIds = toExcludedPromptIdSet(options.usedPromptIds);
    const entries = getEnabledPromptEntries(catalog, options.collectionIds);
    const defaultSelect = () => pickRandomPromptEntry(catalog, random, {
      excludedIds: excludedPromptIds,
      collectionIds: options.collectionIds,
    });
    const selectedPrompt = rules?.selectPrompt?.({
      entries,
      excludedPromptIds,
      random,
      defaultSelect,
    }) ?? defaultSelect();

    return selectedPrompt ?? getFallbackPrompt();
  };

  const getFallbackPrompt = (): TPrompt => {
    return getPromptEntryById(catalog, gamePack.definition.fallbackPrompt.id)
      ?? getPromptEntryByName(catalog, gamePack.definition.fallbackPrompt.name)
      ?? catalog.entries[0]!;
  };

  const addUsedPrompt = (usedPromptIds: ReadonlySet<string> | readonly string[] | string | null | undefined, promptId: string): Set<string> => {
    const nextUsedPromptIds = toExcludedPromptIdSet(usedPromptIds);
    nextUsedPromptIds.add(promptId);
    return nextUsedPromptIds;
  };

  const defaultEvaluateGuess = (prompt: TPrompt, guess: string): PromptGuessEvaluation => {
    const normalizedGuess = rules?.normalizeGuess?.(guess) ?? normalizeGuessText(guess);

    if (!normalizedGuess) {
      return { correct: false, matchedBy: null, normalizedGuess };
    }

    const normalizedAnswer = rules?.normalizeGuess?.(prompt.name) ?? normalizeGuessText(prompt.name);
    if (normalizedGuess === normalizedAnswer) {
      return { correct: true, matchedBy: 'name', normalizedGuess };
    }

    if (prompt.aliases.some((alias) => (rules?.normalizeGuess?.(alias) ?? normalizeGuessText(alias)) === normalizedGuess)) {
      return { correct: true, matchedBy: 'alias', normalizedGuess };
    }

    if (isAcceptedFuzzyGuess(normalizedAnswer, normalizedGuess)) {
      return { correct: true, matchedBy: 'fuzzy', normalizedGuess };
    }

    return { correct: false, matchedBy: null, normalizedGuess };
  };

  return {
    getCollections() {
      return catalog.collections;
    },
    normalizeCollectionIds(collectionIds) {
      return normalizeEnabledCollectionIds(catalog, collectionIds);
    },
    areCollectionIdsValid(collectionIds) {
      return areEnabledCollectionIdsValid(catalog, collectionIds);
    },
    getEnabledPrompts(collectionIds) {
      return getEnabledPromptEntries(catalog, collectionIds);
    },
    getPromptById(promptId) {
      return getPromptEntryById(catalog, promptId);
    },
    getPromptByName(promptName) {
      return getPromptEntryByName(catalog, promptName);
    },
    getFallbackPrompt,
    assign(options) {
      const prompt = pickPrompt(options);
      return {
        prompt,
        usedPromptIds: addUsedPrompt(options.usedPromptIds, prompt.id),
      };
    },
    reroll(options) {
      const rerolledFrom = getPromptEntryById(catalog, options.currentPromptId);
      const prompt = pickPrompt({
        collectionIds: options.collectionIds,
        usedPromptIds: options.usedPromptIds,
        random: options.random,
      });

      return {
        prompt,
        rerolledFrom,
        usedPromptIds: addUsedPrompt(options.usedPromptIds, prompt.id),
      };
    },
    evaluateGuess(promptId, guess) {
      const prompt = getPromptEntryById(catalog, promptId);
      if (!prompt) {
        const normalizedGuess = rules?.normalizeGuess?.(guess) ?? normalizeGuessText(guess);
        return { correct: false, matchedBy: null, normalizedGuess };
      }

      const normalizedGuess = rules?.normalizeGuess?.(guess) ?? normalizeGuessText(guess);
      const defaultEvaluate = () => defaultEvaluateGuess(prompt, guess);
      return rules?.evaluateGuess?.({ prompt, guess, normalizedGuess, defaultEvaluate }) ?? defaultEvaluate();
    },
    isCorrectGuess(promptId, guess) {
      return this.evaluateGuess(promptId, guess).correct;
    },
    getReferenceArtUrl(promptId) {
      const prompt = getPromptEntryById(catalog, promptId);
      return resolveGamePackPromptArtUrl(gamePack, prompt);
    },
    getPublicPrompt(promptId) {
      const prompt = getPromptEntryById(catalog, promptId);
      if (!prompt) {
        return null;
      }

      return {
        id: prompt.id,
        name: prompt.name,
        referenceArtUrl: resolveGamePackPromptArtUrl(gamePack, prompt),
      };
    },
  };
}

export function getDefaultPromptCollectionIds<TPrompt extends PromptEntry>(gamePack: GamePack<TPrompt>): string[] {
  return getDefaultEnabledCollectionIds(gamePack.definition.promptCatalog);
}

const QWERTY_ROWS = [
  { keys: '1234567890', offset: 0 },
  { keys: 'qwertyuiop', offset: 0.5 },
  { keys: 'asdfghjkl', offset: 1 },
  { keys: 'zxcvbnm', offset: 1.5 },
] as const;

const QWERTY_ADJACENT_KEYS = buildQwertyAdjacentKeyMap();

export function normalizeGuessText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildQwertyAdjacentKeyMap(): Map<string, Set<string>> {
  const positions = new Map<string, { x: number; y: number }>();

  QWERTY_ROWS.forEach((row, rowIndex) => {
    Array.from(row.keys).forEach((key, columnIndex) => {
      positions.set(key, { x: row.offset + columnIndex, y: rowIndex });
    });
  });

  const adjacentKeys = new Map<string, Set<string>>();

  positions.forEach((leftPosition, leftKey) => {
    const neighbors = new Set<string>();

    positions.forEach((rightPosition, rightKey) => {
      if (leftKey === rightKey) {
        return;
      }

      if (Math.abs(leftPosition.x - rightPosition.x) <= 1 && Math.abs(leftPosition.y - rightPosition.y) <= 1) {
        neighbors.add(rightKey);
      }
    });

    adjacentKeys.set(leftKey, neighbors);
  });

  return adjacentKeys;
}

function isAcceptedFuzzyGuess(answer: string, guess: string): boolean {
  if (answer.length < 5) {
    return false;
  }

  if (answer.length < 8) {
    return hasSingleAdjacentKeyboardSubstitution(answer, guess) || hasSingleAdjacentTransposition(answer, guess);
  }

  return isWithinSingleDamerauEdit(answer, guess);
}

function hasSingleAdjacentKeyboardSubstitution(answer: string, guess: string): boolean {
  if (answer.length !== guess.length) {
    return false;
  }

  let mismatchIndex = -1;

  for (let index = 0; index < answer.length; index += 1) {
    if (answer[index] === guess[index]) {
      continue;
    }

    if (mismatchIndex !== -1) {
      return false;
    }

    mismatchIndex = index;
  }

  if (mismatchIndex === -1) {
    return false;
  }

  return areQwertyAdjacent(answer[mismatchIndex] ?? '', guess[mismatchIndex] ?? '');
}

function hasSingleAdjacentTransposition(answer: string, guess: string): boolean {
  if (answer.length !== guess.length) {
    return false;
  }

  let mismatchIndex = 0;
  while (mismatchIndex < answer.length && answer[mismatchIndex] === guess[mismatchIndex]) {
    mismatchIndex += 1;
  }

  if (mismatchIndex >= answer.length - 1) {
    return false;
  }

  if (answer[mismatchIndex] !== guess[mismatchIndex + 1] || answer[mismatchIndex + 1] !== guess[mismatchIndex]) {
    return false;
  }

  for (let index = mismatchIndex + 2; index < answer.length; index += 1) {
    if (answer[index] !== guess[index]) {
      return false;
    }
  }

  return true;
}

function isWithinSingleDamerauEdit(answer: string, guess: string): boolean {
  if (hasSingleAdjacentTransposition(answer, guess)) {
    return true;
  }

  if (answer.length === guess.length) {
    return hasSingleSubstitution(answer, guess);
  }

  if (Math.abs(answer.length - guess.length) !== 1) {
    return false;
  }

  return hasSingleInsertionOrDeletion(answer, guess);
}

function hasSingleSubstitution(answer: string, guess: string): boolean {
  if (answer.length !== guess.length) {
    return false;
  }

  let mismatchCount = 0;

  for (let index = 0; index < answer.length; index += 1) {
    if (answer[index] === guess[index]) {
      continue;
    }

    mismatchCount += 1;
    if (mismatchCount > 1) {
      return false;
    }
  }

  return mismatchCount === 1;
}

function hasSingleInsertionOrDeletion(answer: string, guess: string): boolean {
  const longerValue = answer.length > guess.length ? answer : guess;
  const shorterValue = answer.length > guess.length ? guess : answer;
  let longerIndex = 0;
  let shorterIndex = 0;
  let skippedCharacter = false;

  while (longerIndex < longerValue.length && shorterIndex < shorterValue.length) {
    if (longerValue[longerIndex] === shorterValue[shorterIndex]) {
      longerIndex += 1;
      shorterIndex += 1;
      continue;
    }

    if (skippedCharacter) {
      return false;
    }

    skippedCharacter = true;
    longerIndex += 1;
  }

  return true;
}

function areQwertyAdjacent(leftKey: string, rightKey: string): boolean {
  return QWERTY_ADJACENT_KEYS.get(leftKey)?.has(rightKey) ?? false;
}
