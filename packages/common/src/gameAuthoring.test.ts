import { describe, expect, it } from 'vitest';
import { createPromptEngine } from './promptEngine';
import { defineDrawingGameRules } from './drawingGameRules';
import { defineAudienceGame } from './gameAuthoring';
import { compileShellApp } from './gameRuntime';
import { defineGameBuildConfig, defineShellApp, resolveGamePackPromptArtUrl, resolveShellUiConfig } from './gamePack';
import type { PromptEntry } from './promptCatalog';

interface TestPrompt extends PromptEntry {
  rarity?: string;
}

const collections = [{ id: 'base', name: 'Base', enabledByDefault: true }] as const;
const prompts: readonly TestPrompt[] = [
  { id: 'alpha', name: 'Alpha', aliases: ['A'], enabled: true, artFileName: 'alpha.png', collectionIds: ['base'], rarity: 'common' },
  { id: 'beta', name: 'Beta', aliases: [], enabled: true, collectionIds: ['base'], rarity: 'rare' },
];

describe('defineAudienceGame', () => {
  it('defines a minimal audience game with safe defaults', () => {
    const game = defineAudienceGame({
      id: 'object-sketch',
      title: 'Object Sketch',
      tagline: 'Draw objects with friends.',
      prompts: { collections, entries: prompts },
    });

    expect(game.pack.definition.storageNamespace).toBe('object-sketch');
    expect(game.pack.definition.brand.logoText).toEqual(['Object', 'Sketch']);
    expect(game.pack.definition.fallbackPrompt).toEqual({ id: 'alpha', name: 'Alpha' });
    expect(resolveShellUiConfig(game.pack).logo.parts).toEqual(['Object', 'Sketch']);
  });

  it('resolves fallback prompts, browser asset URLs, and build-only asset source', () => {
    const localDir = new URL('../assets/', import.meta.url);
    const game = defineAudienceGame({
      id: 'object-sketch',
      title: 'Object Sketch',
      tagline: 'Draw objects with friends.',
      prompts: { collections, entries: prompts, fallbackPromptId: 'beta' },
      assets: {
        localDir,
        publicBasePath: 'object-assets',
        iconFileName: 'icon.png',
      },
    });

    expect(game.pack.definition.fallbackPrompt).toEqual({ id: 'beta', name: 'Beta' });
    expect(game.pack.assets?.iconHref).toBe('/object-assets/icon.png');
    expect(resolveGamePackPromptArtUrl(game.pack, prompts[0])).toBe('/object-assets/alpha.png');
    expect(game.build).toEqual({ assets: { sourceDir: localDir, publicBasePath: '/object-assets/' } });
    const shell = compileShellApp(defineShellApp({ game }));

    expect(shell.build.assets?.publicBasePath).toBe('/object-assets/');
    expect(JSON.stringify(game.pack)).not.toContain('sourceDir');
    expect(JSON.stringify(game.pack)).not.toContain('../assets/');
    expect(JSON.stringify(shell.browser.manifestJson)).not.toContain('localDir');
    expect(JSON.stringify(shell.browser.manifestJson)).not.toContain('sourceDir');
    expect(shell.browser.manifestJson.assets).toEqual({ iconHref: '/object-assets/icon.png', publicBasePath: '/object-assets/' });
  });

  it('keeps manual shell app build wiring available for advanced callers', () => {
    const game = defineAudienceGame({
      id: 'manual-game',
      title: 'Manual Game',
      tagline: 'Manual.',
      prompts: { collections, entries: prompts },
      assets: {
        localDir: new URL('../assets/', import.meta.url),
        publicBasePath: '/authored-assets/',
      },
    });

    const config = defineShellApp({
      game: game.pack,
      build: defineGameBuildConfig({
        assets: {
          sourceDir: './fixtures/assets',
          publicBasePath: '/manual-assets/',
        },
      }),
    });
    const shell = compileShellApp(config, { relativeSourceBaseUrl: new URL('./', import.meta.url) });

    expect(shell.build.assets?.publicBasePath).toBe('/manual-assets/');
    expect(shell.browser.manifestJson.definition.id).toBe('manual-game');
  });

  it('supports explicit art URL and art file resolvers', () => {
    const cdnGame = defineAudienceGame({
      id: 'cdn-game',
      title: 'CDN Game',
      tagline: 'CDN.',
      prompts: { collections, entries: prompts },
      assets: {
        publicBasePath: '/fallback-art/',
        promptArtUrl: (prompt) => prompt.id === 'alpha' ? `https://cdn.example/${prompt.id}.webp` : null,
      },
    });
    const fileGame = defineAudienceGame({
      id: 'file-game',
      title: 'File Game',
      tagline: 'Files.',
      prompts: { collections, entries: prompts },
      assets: {
        publicBasePath: '/file-art/',
        promptArtFile: (prompt) => `${prompt.id}.jpg`,
      },
    });

    expect(resolveGamePackPromptArtUrl(cdnGame.pack, prompts[0])).toBe('https://cdn.example/alpha.webp');
    expect(resolveGamePackPromptArtUrl(cdnGame.pack, prompts[1])).toBeNull();
    expect(resolveGamePackPromptArtUrl(fileGame.pack, prompts[1])).toBe('/file-art/beta.jpg');
  });

  it('preserves drawing game rules for runtime resolution', () => {
    const rules = defineDrawingGameRules({
      timers: {
        roundSeconds: [60, 90],
        defaultRoundSeconds: 60,
      },
      turns: {
        rerollsPerTurn: 0,
      },
    });
    const game = defineAudienceGame({
      id: 'rules-game',
      title: 'Rules Game',
      tagline: 'Rules.',
      prompts: { collections, entries: prompts },
      rules,
    });

    expect(game.pack.rules).toBe(rules);
  });

  it('preserves custom prompt rules through prompt engine creation', () => {
    const game = defineAudienceGame({
      id: 'rules-game',
      title: 'Rules Game',
      tagline: 'Rules.',
      prompts: { collections, entries: prompts },
      promptRules: {
        evaluateGuess: ({ prompt, normalizedGuess }) => ({
          correct: prompt.rarity === normalizedGuess,
          matchedBy: prompt.rarity === normalizedGuess ? 'custom' : null,
          normalizedGuess,
        }),
      },
    });

    const engine = createPromptEngine(game.pack);

    expect(engine.isCorrectGuess('beta', 'rare')).toBe(true);
    expect(engine.isCorrectGuess('beta', 'Beta')).toBe(false);
  });

  it('throws useful authoring errors for invalid prompt data', () => {
    expect(() => defineAudienceGame({
      id: 'bad-fallback',
      title: 'Bad Fallback',
      tagline: 'Bad.',
      prompts: { collections, entries: prompts, fallbackPromptId: 'missing' },
    })).toThrow('fallback prompt id "missing" was not found or is disabled');

    expect(() => defineAudienceGame({
      id: 'bad-collection',
      title: 'Bad Collection',
      tagline: 'Bad.',
      prompts: {
        collections,
        entries: [{ id: 'orphan', name: 'Orphan', aliases: [], enabled: true, collectionIds: ['missing'] }],
      },
    })).toThrow('Unknown prompt collection ids');
  });
});
