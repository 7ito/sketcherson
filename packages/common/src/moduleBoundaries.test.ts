import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDrawingActionToState, type DrawingState } from './drawing';
import { createPromptEngine, normalizeGuessText } from './prompts';
import { calculateGuesserScore } from './scoring';
import { areLobbySettingsValidForGame, getFirstCorrectGuessTimeCapPresets } from './settings';
import { buildGameCookieName, buildGameStorageKey } from './storage';
import { TEST_GAME_DEFINITION } from '@sketcherson/common/testing/testGame';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHELL_SOURCE_ROOTS = ['packages/common/src', 'apps/server/src', 'apps/web/src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_SHELL_IMPORTS = [
  `@${'sketch' + 'royale'}/game`,
  `packages/${'sketch'}-${'royale'}-game`,
  `${'sketch'}-${'royale'}-game/src`,
];
const FORBIDDEN_SOURCE_TEXT = [
  `${'Sketch'} ${'Royale'}`,
  `${'Clash'} ${'Royale'}`,
  'Super' + 'cell',
  'Poke' + 'mon',
  'Nin' + 'tendo',
];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }

    return SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.includes('.test.') ? [path] : [];
  });
}

function collectSourceAndManifestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'dist' || entry.name === 'node_modules') {
      return [];
    }

    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceAndManifestFiles(path);
    }

    return ['.ts', '.tsx', '.md', '.json'].includes(extname(entry.name)) ? [path] : [];
  });
}

function createTestDrawingState(): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
  };
}

describe('module boundaries', () => {
  it('keeps reusable shell source independent from product-specific game packs', () => {
    const violations = SHELL_SOURCE_ROOTS.flatMap((sourceRoot) =>
      collectSourceFiles(resolve(REPO_ROOT, sourceRoot)).flatMap((sourceFile) => {
        const source = readFileSync(sourceFile, 'utf8');
        return FORBIDDEN_SHELL_IMPORTS.filter((forbiddenImport) => source.includes(forbiddenImport)).map(
          (forbiddenImport) => `${relative(REPO_ROOT, sourceFile)} imports ${forbiddenImport}`,
        );
      }),
    );

    expect(violations).toEqual([]);
  });

  it('keeps generic source and package manifests free from removed IP terms', () => {
    const roots = ['package.json', 'shell.config.ts', 'docs', 'packages', 'apps'] as const;
    const files = roots.flatMap((root) => {
      const absoluteRoot = resolve(REPO_ROOT, root);
      const rootStatFiles = root.endsWith('.json') || root.endsWith('.ts') ? [absoluteRoot] : collectSourceAndManifestFiles(absoluteRoot);
      return rootStatFiles;
    });

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_SOURCE_TEXT.filter((forbiddenText) => source.includes(forbiddenText)).map(
        (forbiddenText) => `${relative(REPO_ROOT, file)} contains ${forbiddenText}`,
      );
    });

    expect(violations).toEqual([]);
  });
});

describe('generic game definition helpers', () => {
  it('supports storage and cookie names for arbitrary game definitions', () => {
    expect(buildGameStorageKey(TEST_GAME_DEFINITION, 'joined-session')).toBe('testgame.joined-session');
    expect(buildGameCookieName(TEST_GAME_DEFINITION, 'preferred-nickname')).toBe('testgame-preferred-nickname');
    expect(buildGameStorageKey(TEST_GAME_DEFINITION, 'userSettings', ':')).toBe('testgame:userSettings');
  });

  it('uses prompt collections, aliases, fallback prompts, and art from a non-product test game', () => {
    expect(TEST_GAME_DEFINITION).toMatchObject({
      id: 'test-game',
      title: 'Test Game',
      storageNamespace: 'testgame',
      terminology: {
        promptNoun: 'prompt',
        collectionPlural: 'prompt packs',
        referenceArtLabel: 'reference image',
      },
      fallbackPrompt: {
        id: 'dragon',
        name: 'Dragon',
      },
    });

    const promptEngine = createPromptEngine({ definition: TEST_GAME_DEFINITION });

    expect(promptEngine.getPromptByName('Dragon')?.id).toBe('dragon');
    expect(promptEngine.getEnabledPrompts().map((prompt) => prompt.id)).toEqual(['dragon', 'robot']);
    expect(promptEngine.getEnabledPrompts(['fantasy']).map((prompt) => prompt.id)).toEqual(['dragon', 'wizard']);
    expect(promptEngine.areCollectionIdsValid(['creatures', 'objects'])).toBe(true);
    expect(promptEngine.areCollectionIdsValid(['missing'])).toBe(false);
    expect(promptEngine.getReferenceArtUrl('dragon')).toBe('/Dragon.png');
    expect(promptEngine.getReferenceArtUrl('wizard')).toBeNull();
    expect(promptEngine.getFallbackPrompt()).toMatchObject({ id: 'dragon', name: 'Dragon' });
    expect(promptEngine.isCorrectGuess('dragon', 'drake')).toBe(true);
    expect(promptEngine.isCorrectGuess('robot', 'bot')).toBe(true);
    expect(promptEngine.isCorrectGuess('robot', 'dragon')).toBe(false);
  });
});

describe('guess helpers', () => {
  it('normalizes guesses by removing spaces and punctuation', () => {
    expect(normalizeGuessText('  P.E.K.K.A  ')).toBe('pekka');
    expect(normalizeGuessText('X-Bow')).toBe('xbow');
  });

  it('accepts one-off typos for canonical names with safe thresholds', () => {
    const promptEngine = createPromptEngine({ definition: TEST_GAME_DEFINITION });

    expect(promptEngine.isCorrectGuess('dragon', 'dragin')).toBe(true);
    expect(promptEngine.isCorrectGuess('dragon', 'dargon')).toBe(true);
  });

  it('keeps short names and aliases strict', () => {
    const promptEngine = createPromptEngine({ definition: TEST_GAME_DEFINITION });

    expect(promptEngine.isCorrectGuess('robot', 'robt')).toBe(false);
    expect(promptEngine.isCorrectGuess('robot', 'bot')).toBe(true);
    expect(promptEngine.isCorrectGuess('robot', 'bat')).toBe(false);
  });
});

describe('lobby settings helpers', () => {
  it('calculates guesser score on a 100 to 30 linear decay', () => {
    expect(calculateGuesserScore(0, 90_000)).toBe(100);
    expect(calculateGuesserScore(45_000, 90_000)).toBe(65);
    expect(calculateGuesserScore(90_000, 90_000)).toBe(30);
    expect(calculateGuesserScore(120_000, 90_000)).toBe(30);
  });

  it('validates and filters first-correct-guess time cap settings against the round timer', () => {
    expect(getFirstCorrectGuessTimeCapPresets(60)).toEqual([15, 30, 45, 60]);
    expect(getFirstCorrectGuessTimeCapPresets(120)).toEqual([15, 30, 45, 60, 75, 90]);

    expect(
      areLobbySettingsValidForGame(TEST_GAME_DEFINITION, {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 60,
        guessingDelaySeconds: 5,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['creatures', 'objects'],
      }),
    ).toBe(true);

    expect(
      areLobbySettingsValidForGame(TEST_GAME_DEFINITION, {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 75,
        guessingDelaySeconds: 5,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['creatures'],
      }),
    ).toBe(false);

    expect(
      areLobbySettingsValidForGame(TEST_GAME_DEFINITION, {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 60,
        guessingDelaySeconds: 7 as never,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: ['creatures'],
      }),
    ).toBe(false);

    expect(
      areLobbySettingsValidForGame(TEST_GAME_DEFINITION, {
        roundTimerSeconds: 60,
        firstCorrectGuessTimeCapSeconds: 60,
        guessingDelaySeconds: 5,
        turnsPerPlayer: 3,
        artEnabled: true,
        enabledCollectionIds: [],
      }),
    ).toBe(false);
  });
});

describe('drawing state helpers', () => {
  it('applies live drawing actions to local drawing state', () => {
    const drawing = createTestDrawingState();

    expect(
      applyDrawingActionToState(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 120, y: 80 },
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingActionToState(drawing, {
        type: 'extendStroke',
        strokeId: 'stroke-1',
        points: [
          { x: 180, y: 120 },
          { x: 220, y: 180 },
          { x: 260, y: 220 },
        ],
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingActionToState(drawing, {
        type: 'endStroke',
        strokeId: 'stroke-1',
      }).ok,
    ).toBe(true);

    expect(drawing.operations).toHaveLength(1);
    expect(drawing.activeStrokes).toEqual([]);
    expect(drawing.operations[0]).toMatchObject({ kind: 'stroke' });
    expect(drawing.operations[0]?.kind === 'stroke' ? drawing.operations[0].points : []).toHaveLength(4);
    expect(drawing.revision).toBe(3);
  });

  it('allows long strokes when they are sent in valid extend batches', () => {
    const drawing = createTestDrawingState();

    expect(
      applyDrawingActionToState(drawing, {
        type: 'beginStroke',
        strokeId: 'long-stroke',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 10, y: 10 },
      }).ok,
    ).toBe(true);

    const longStrokePoints = Array.from({ length: 1_500 }, (_, index) => ({
      x: (index % 700) + 20,
      y: (Math.floor(index / 700) % 500) + 20,
    }));

    expect(
      applyDrawingActionToState(drawing, {
        type: 'extendStroke',
        strokeId: 'long-stroke',
        points: longStrokePoints,
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingActionToState(drawing, {
        type: 'endStroke',
        strokeId: 'long-stroke',
      }).ok,
    ).toBe(true);

    expect(drawing.operations).toHaveLength(1);
    expect(drawing.operations[0]?.kind === 'stroke' ? drawing.operations[0].points : []).toHaveLength(1_501);
  });

  it('allows multiple active strokes to be extended and completed independently', () => {
    const drawing = createTestDrawingState();

    expect(
      applyDrawingActionToState(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-1',
        tool: 'pen',
        color: '#101a35',
        size: 6,
        point: { x: 50, y: 60 },
      }).ok,
    ).toBe(true);

    expect(
      applyDrawingActionToState(drawing, {
        type: 'beginStroke',
        strokeId: 'stroke-2',
        tool: 'pen',
        color: '#2d56ff',
        size: 8,
        point: { x: 250, y: 260 },
      }).ok,
    ).toBe(true);

    expect(applyDrawingActionToState(drawing, { type: 'extendStroke', strokeId: 'stroke-1', point: { x: 75, y: 95 } }).ok).toBe(true);
    expect(applyDrawingActionToState(drawing, { type: 'extendStroke', strokeId: 'stroke-2', point: { x: 280, y: 290 } }).ok).toBe(true);
    expect(applyDrawingActionToState(drawing, { type: 'endStroke', strokeId: 'stroke-2' }).ok).toBe(true);
    expect(applyDrawingActionToState(drawing, { type: 'extendStroke', strokeId: 'stroke-1', point: { x: 90, y: 120 } }).ok).toBe(true);
    expect(applyDrawingActionToState(drawing, { type: 'endStroke', strokeId: 'stroke-1' }).ok).toBe(true);

    expect(drawing.activeStrokes).toEqual([]);
    expect(drawing.operations).toHaveLength(2);
    expect(drawing.operations[0]).toMatchObject({ kind: 'stroke', id: 'stroke-2' });
    expect(drawing.operations[1]).toMatchObject({ kind: 'stroke', id: 'stroke-1' });
  });

  it('treats clear, undo, and redo as local drawing state transitions', () => {
    const drawing = createTestDrawingState();

    applyDrawingActionToState(drawing, {
      type: 'beginStroke',
      strokeId: 'stroke-1',
      tool: 'pen',
      color: '#2d56ff',
      size: 6,
      point: { x: 40, y: 40 },
    });
    applyDrawingActionToState(drawing, {
      type: 'endStroke',
      strokeId: 'stroke-1',
    });
    applyDrawingActionToState(drawing, {
      type: 'clear',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);

    applyDrawingActionToState(drawing, {
      type: 'undo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke']);
    expect(drawing.undoneOperations.map((operation) => operation.kind)).toEqual(['clear']);

    applyDrawingActionToState(drawing, {
      type: 'redo',
    });

    expect(drawing.operations.map((operation) => operation.kind)).toEqual(['stroke', 'clear']);
    expect(drawing.undoneOperations).toEqual([]);
  });
});
