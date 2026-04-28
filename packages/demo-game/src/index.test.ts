import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileShellApp, defineShellApp, resolveShellUiConfig } from '@sketcherson/common/game';
import { createPromptEngine } from '@sketcherson/common/prompts';
import { buildGameCookieName, buildGameStorageKey } from '@sketcherson/common/storage';
import {
  DEMO_PROMPT_CATALOG,
  DEMO_PROMPTS,
  DEMO_GAME,
  DEMO_GAME_BUILD,
  DEMO_GAME_DEFINITION,
  DEMO_GAME_PACK,
} from './index';
import { describe, expect, it } from 'vitest';

describe('demo game pack', () => {
  it('models a small copyright-safe audience game as data', () => {
    expect(DEMO_GAME_DEFINITION).toMatchObject({
      id: 'sketcherson-demo',
      title: 'Sketcherson Demo',
      tagline: 'Draw and guess a small set of original demo prompts with friends.',
      terminology: {
        promptNoun: 'prompt',
        promptPlural: 'prompts',
        collectionSingular: 'prompt set',
        collectionPlural: 'prompt sets',
        referenceArtLabel: 'reference sketch',
        answerLabel: 'Answer',
        rerollLabel: 'Reroll prompt',
      },
      storageNamespace: 'sketcherson-demo',
      fallbackPrompt: {
        id: 'archer',
        name: 'Archer',
      },
    });

    expect(DEMO_GAME_DEFINITION.promptCatalog.entries.map((prompt) => prompt.name)).toEqual([
      'Archer',
      'Arrows',
      'Dragon',
      'Musketeer',
      'Goblin Cage',
      'Zap',
    ]);
  });

  it('keeps demo assets build-local while exposing browser-safe URLs', () => {
    const sourceDir = DEMO_GAME_BUILD.assets?.sourceDir;

    expect(sourceDir).toBeInstanceOf(URL);
    expect(DEMO_GAME_BUILD.assets?.publicBasePath).toBe('/demo-assets/');
    expect(DEMO_GAME_PACK.assets?.iconHref).toBe('/demo-assets/demo-icon.svg');
    expect(JSON.stringify(DEMO_GAME_PACK)).not.toContain('sourceDir');

    const assetSourcePath = fileURLToPath(sourceDir as URL);
    expect(assetSourcePath).toContain('/packages/demo-game/assets/');
    expect(existsSync(new URL('demo-icon.svg', sourceDir as URL))).toBe(true);
    expect(existsSync(new URL('Archer.svg', sourceDir as URL))).toBe(true);
    expect(existsSync(new URL('Arrows.svg', sourceDir as URL))).toBe(true);
    expect(existsSync(new URL('Goblin Cage.svg', sourceDir as URL))).toBe(true);
  });

  it('works through the generic PromptEngine', () => {
    const promptEngine = createPromptEngine(DEMO_GAME_PACK);

    expect(promptEngine.getCollections()).toEqual(DEMO_PROMPT_CATALOG.collections);
    expect(promptEngine.getEnabledPrompts().map((prompt) => prompt.id)).toEqual(['archer', 'arrows', 'dragon', 'musketeer', 'goblin-cage', 'zap']);
    expect(promptEngine.getFallbackPrompt()).toMatchObject({ id: 'archer', name: 'Archer' });
    expect(promptEngine.getReferenceArtUrl('arrows')).toBe('/demo-assets/Arrows.svg');
    expect(promptEngine.getReferenceArtUrl('goblin-cage')).toBe('/demo-assets/Goblin%20Cage.svg');
    expect(promptEngine.isCorrectGuess('dragon', 'drake')).toBe(true);
    expect(promptEngine.isCorrectGuess('arrows', 'arrow')).toBe(true);
    expect(promptEngine.isCorrectGuess('zap', 'xap')).toBe(false);
  });

  it('compiles as a selectable shell app game', () => {
    const shell = compileShellApp(defineShellApp({ game: DEMO_GAME }));

    expect(shell.server.createRuntime().definition.id).toBe('sketcherson-demo');
    expect(shell.browser.manifestJson.definition.promptCatalog.entries).toHaveLength(6);
    expect(shell.browser.manifestJson.assets).toEqual({
      iconHref: '/demo-assets/demo-icon.svg',
      publicBasePath: '/demo-assets/',
    });
    expect(JSON.stringify(shell.browser.manifestJson)).not.toContain('sourceDir');
    expect(shell.build.assets?.publicBasePath).toBe('/demo-assets/');
  });

  it('derives shell UI and storage settings from the demo game', () => {
    const uiConfig = resolveShellUiConfig(DEMO_GAME_PACK);

    expect(uiConfig.logo.parts).toEqual(['Sketcherson', 'Demo']);
    expect(uiConfig.copy.match.promptHeader).toBe('Your {PromptNoun}');
    expect(uiConfig.copy.settings.referenceArtToggleLabel).toBe('reference sketch');
    expect(uiConfig.nicknamePlaceholders).toEqual({ create: 'DoodleHost', join: 'SketchGuest' });
    expect(buildGameStorageKey(DEMO_GAME_DEFINITION, 'joined-session')).toBe('sketcherson-demo.joined-session');
    expect(buildGameCookieName(DEMO_GAME_DEFINITION, 'preferred-nickname')).toBe('sketcherson-demo-preferred-nickname');
  });

  it('uses the authored demo catalog directly', () => {
    expect(DEMO_PROMPTS).toEqual([
      expect.objectContaining({ id: 'archer', name: 'Archer', kind: 'character' }),
      expect.objectContaining({ id: 'arrows', name: 'Arrows', kind: 'quick-mark' }),
      expect.objectContaining({ id: 'dragon', name: 'Dragon', kind: 'character' }),
      expect.objectContaining({ id: 'musketeer', name: 'Musketeer', kind: 'character' }),
      expect.objectContaining({ id: 'goblin-cage', name: 'Goblin Cage', kind: 'prop' }),
      expect.objectContaining({ id: 'zap', name: 'Zap', kind: 'quick-mark' }),
    ]);
  });
});
