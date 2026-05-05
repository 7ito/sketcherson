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

export interface PromptCloseGuess {
  kind?: string;
  message?: string;
}

export interface PromptGuessEvaluation {
  correct: boolean;
  matchedBy: PromptGuessMatchKind | null;
  normalizedGuess: string;
  closeGuess?: PromptCloseGuess | null;
}

export interface PromptDisplayBadge {
  label: string;
  value?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

export interface PromptDisplayMetadata {
  subtitle?: string;
  badges?: PromptDisplayBadge[];
  tags?: string[];
  custom?: Record<string, string | number | boolean | null>;
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
  resolveDisplayMetadata?: (prompt: TPrompt) => PromptDisplayMetadata | null | undefined;
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
  getDisplayMetadata(promptId: string): PromptDisplayMetadata | null;
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
    getDisplayMetadata(promptId) {
      const prompt = getPromptEntryById(catalog, promptId);
      if (!prompt || !rules?.resolveDisplayMetadata) {
        return null;
      }

      return sanitizePromptDisplayMetadata(rules.resolveDisplayMetadata(prompt));
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

const PROMPT_DISPLAY_BADGE_TONES = new Set(['neutral', 'accent', 'success', 'warning', 'danger']);

function sanitizePromptDisplayMetadata(metadata: PromptDisplayMetadata | null | undefined): PromptDisplayMetadata | null {
  if (!metadata) {
    return null;
  }

  return {
    ...(metadata.subtitle ? { subtitle: String(metadata.subtitle) } : {}),
    ...(metadata.badges?.length
      ? {
          badges: metadata.badges.map((badge) => {
            const tone = badge.tone && PROMPT_DISPLAY_BADGE_TONES.has(String(badge.tone)) ? badge.tone : undefined;

            return {
              label: String(badge.label),
              ...(badge.value === undefined ? {} : { value: String(badge.value) }),
              ...(tone ? { tone } : {}),
            };
          }),
        }
      : {}),
    ...(metadata.tags?.length ? { tags: metadata.tags.map(String) } : {}),
    ...(metadata.custom ? { custom: { ...metadata.custom } } : {}),
  };
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

export function isAcceptedFuzzyGuess(answer: string, guess: string): boolean {
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
  return isWithinDamerauLevenshteinDistance(answer, guess, 1) && answer !== guess;
}

export function isWithinDamerauLevenshteinDistance(left: string, right: string, maxDistance: number): boolean {
  return getDamerauLevenshteinDistance(left, right, maxDistance) <= maxDistance;
}

export function getDamerauLevenshteinDistance(left: string, right: string, maxDistance = Number.POSITIVE_INFINITY): number {
  if (maxDistance < 0) {
    return maxDistance + 1;
  }

  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let twoRowsBack = Array.from({ length: right.length + 1 }, () => 0);
  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    let rowMinimum = currentRow[0] ?? leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      let distance = Math.min(
        (previousRow[rightIndex] ?? 0) + 1,
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost,
      );

      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distance = Math.min(distance, (twoRowsBack[rightIndex - 2] ?? 0) + 1);
      }

      currentRow[rightIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    twoRowsBack = previousRow;
    previousRow = currentRow;
  }

  return previousRow[right.length] ?? maxDistance + 1;
}


function areQwertyAdjacent(leftKey: string, rightKey: string): boolean {
  return QWERTY_ADJACENT_KEYS.get(leftKey)?.has(rightKey) ?? false;
}
