import { describe, expect, it } from 'vitest';
import { defineGamePack } from './gamePack';
import { createPromptEngine } from './promptEngine';
import { TEST_GAME_DEFINITION, type TestGamePrompt } from './games/testGame';

const TEST_GAME_PACK = defineGamePack<TestGamePrompt>({
  definition: TEST_GAME_DEFINITION,
  assets: {
    publicBasePath: '/test-assets',
  },
});

describe('prompt engine', () => {
  it('normalizes and validates collection ids', () => {
    const engine = createPromptEngine(TEST_GAME_PACK);

    expect(engine.normalizeCollectionIds()).toEqual(['creatures', 'objects']);
    expect(engine.normalizeCollectionIds(['fantasy', 'missing'])).toEqual(['fantasy']);
    expect(engine.areCollectionIdsValid(['creatures', 'objects'])).toBe(true);
    expect(engine.areCollectionIdsValid(['missing'])).toBe(false);
    expect(engine.areCollectionIdsValid([])).toBe(false);
  });

  it('picks enabled prompts from enabled collections and avoids used prompts when possible', () => {
    const engine = createPromptEngine(TEST_GAME_PACK);

    expect(engine.assign({ collectionIds: ['fantasy'], random: () => 0 }).prompt.id).toBe('dragon');

    const assignment = engine.assign({
      collectionIds: ['fantasy'],
      usedPromptIds: new Set(['dragon']),
      random: () => 0,
    });

    expect(assignment.prompt.id).toBe('wizard');
    expect(Array.from(assignment.usedPromptIds).sort()).toEqual(['dragon', 'wizard']);
  });

  it('falls back to the enabled pool when every prompt is used', () => {
    const engine = createPromptEngine(TEST_GAME_PACK);

    const assignment = engine.assign({
      collectionIds: ['fantasy'],
      usedPromptIds: new Set(['dragon', 'wizard']),
      random: () => 0,
    });

    expect(assignment.prompt.id).toBe('dragon');
    expect(Array.from(assignment.usedPromptIds).sort()).toEqual(['dragon', 'wizard']);
  });

  it('falls back to the configured fallback prompt when no enabled prompt is selectable', () => {
    const gamePack = defineGamePack<TestGamePrompt>({
      definition: {
        ...TEST_GAME_DEFINITION,
        promptCatalog: {
          ...TEST_GAME_DEFINITION.promptCatalog,
          collections: [
            {
              id: 'empty',
              name: 'Empty',
              enabledByDefault: true,
            },
          ],
        },
      },
    });
    const engine = createPromptEngine(gamePack);

    expect(engine.assign({ collectionIds: ['empty'] }).prompt.id).toBe('dragon');
  });

  it('rerolls and returns the previous prompt metadata', () => {
    const engine = createPromptEngine(TEST_GAME_PACK);

    const reroll = engine.reroll({
      currentPromptId: 'dragon',
      collectionIds: ['fantasy'],
      usedPromptIds: new Set(['dragon']),
      random: () => 0,
    });

    expect(reroll.prompt.id).toBe('wizard');
    expect(reroll.rerolledFrom?.id).toBe('dragon');
    expect(Array.from(reroll.usedPromptIds).sort()).toEqual(['dragon', 'wizard']);
  });

  it('evaluates exact, alias, fuzzy, and incorrect guesses', () => {
    const engine = createPromptEngine(TEST_GAME_PACK);

    expect(engine.evaluateGuess('dragon', 'Dragon')).toMatchObject({ correct: true, matchedBy: 'name' });
    expect(engine.evaluateGuess('dragon', 'drake')).toMatchObject({ correct: true, matchedBy: 'alias' });
    expect(engine.evaluateGuess('dragon', 'dragin')).toMatchObject({ correct: true, matchedBy: 'fuzzy' });
    expect(engine.evaluateGuess('robot', 'robt')).toMatchObject({ correct: false, matchedBy: null });
    expect(engine.isCorrectGuess('robot', 'bot')).toBe(true);
  });

  it('supports game-pack custom guess rules', () => {
    const engine = createPromptEngine(defineGamePack<TestGamePrompt>({
      definition: TEST_GAME_DEFINITION,
      promptRules: {
        evaluateGuess: ({ prompt, normalizedGuess, defaultEvaluate }) => {
          const defaultResult = defaultEvaluate();
          if (defaultResult.correct) {
            return defaultResult;
          }

          if (prompt.id === 'dragon' && normalizedGuess === '149') {
            return { correct: true, matchedBy: 'custom', normalizedGuess };
          }

          return defaultResult;
        },
      },
    }));

    expect(engine.evaluateGuess('dragon', '149')).toMatchObject({ correct: true, matchedBy: 'custom' });
  });

  it('resolves reference art through game-pack assets', () => {
    const engine = createPromptEngine(defineGamePack<TestGamePrompt>({
      definition: TEST_GAME_DEFINITION,
      assets: {
        resolvePromptArtUrl: (prompt) => `/custom/${prompt.id}.png`,
      },
    }));

    expect(engine.getReferenceArtUrl('dragon')).toBe('/custom/dragon.png');
    expect(engine.getPublicPrompt('dragon')).toEqual({
      id: 'dragon',
      name: 'Dragon',
      referenceArtUrl: '/custom/dragon.png',
    });
  });
});
