import { describe, expect, it } from 'vitest';
import { defineDrawingGameRules } from './drawingGameRules';
import { defineGamePack } from './gamePack';
import {
  compileShellApp,
  createSketchersonApp,
  createBrowserGameRuntimeManifest,
  isPathInsideDirectory,
  normalizeShellPublicBasePath,
  resolveShellGameAssetMount,
  resolveShellAssetSource,
  createServerGameRuntime,
  getShellStaticAssetContentType,
  hydrateBrowserGameRuntime,
  renderBrowserGameRuntimeModule,
  renderShellIndexHtml,
  resolveShellStaticAssetRequest,
} from './gameRuntime';
import { TEST_GAME_DEFINITION, TEST_GAME_PACK, type TestGamePrompt } from './games/testGame';

const CUSTOM_RULES_GAME_PACK = defineGamePack<TestGamePrompt>({
  definition: TEST_GAME_DEFINITION,
  assets: {
    publicBasePath: '/fallback-art',
    iconHref: '/custom-icon.png',
    resolvePromptArtUrl: (prompt) => `/custom-art/${prompt.id}.webp`,
  },
  promptRules: {
    selectPrompt: ({ entries }) => entries.find((entry) => entry.id === 'robot') ?? null,
    evaluateGuess: ({ guess, defaultEvaluate }) => {
      if (guess === 'custom answer') {
        return { correct: true, matchedBy: 'custom', normalizedGuess: guess };
      }

      return defaultEvaluate();
    },
  },
  rules: defineDrawingGameRules({
    timers: {
      roundSeconds: [60, 75, 90],
      defaultRoundSeconds: 60,
      firstCorrectGuessCaps: [15, 30, 45, 60],
      defaultFirstCorrectGuessCap: 15,
      guessingDelaySeconds: [0, 10],
      defaultGuessingDelaySeconds: 10,
    },
    turns: {
      perPlayerOptions: [1, 2],
      defaultTurnsPerPlayer: 2,
      rerollsPerTurn: 0,
    },
    scoring: {
      drawerPointsPerCorrectGuess: 25,
      guesserPoints: ({ elapsedMs, roundDurationMs }) => Math.round(100 - (elapsedMs / roundDurationMs) * 50),
      endRoundWhenAllGuessersCorrect: false,
      capRoundAfterFirstCorrectGuess: false,
    },
  }),
  ui: {
    theme: {
      colors: {
        primary: '#123456',
      },
    },
    copy: {
      room: {
        scoreboardHeader: 'Custom scores',
      },
    },
  },
});

describe('server game runtime', () => {
  it('exposes the server-side game pack boundary through one runtime object', () => {
    const game = createServerGameRuntime(TEST_GAME_PACK);

    expect(game.kind).toBe('server');
    expect(game.pack).toBe(TEST_GAME_PACK);
    expect(game.definition).toBe(TEST_GAME_DEFINITION);
    expect(game.ui.copy.room.scoreboardHeader).toBe('Scoreboard');
    expect(game.ui.theme.colors.primary).toBe('#111111');
    expect(game.ui.config().nicknamePlaceholders.create).toBe('DragonDrawer');
    expect(game.storage.key('joined-session')).toBe('testgame.joined-session');
    expect(game.storage.key('userSettings', ':')).toBe('testgame:userSettings');
    expect(game.storage.cookie('preferred-nickname')).toBe('testgame-preferred-nickname');
    expect(game.assets.iconHref()).toBe('/test-icon.png');
    expect(game.assets.promptArtUrl('dragon')).toBe('/test-assets/Dragon.png');
    expect(game.assets.promptArtUrl('missing')).toBeNull();

    expect(game.settings.defaults()).toMatchObject({
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      enabledCollectionIds: ['creatures', 'objects'],
    });
    expect(game.settings.firstCorrectGuessCaps(60)).toEqual([15, 30, 45, 60]);
    expect(game.settings.defaults().rerollsPerTurn).toBe(1);
    expect(game.settings.validate(game.settings.defaults())).toBe(true);
    expect(game.settings.validate({ ...game.settings.defaults(), rerollsPerTurn: 'unlimited' })).toBe(true);
    expect(game.settings.validate({ ...game.settings.defaults(), rerollsPerTurn: 11 as never })).toBe(false);
    expect(game.settings.normalize({ ...game.settings.defaults(), enabledCollectionIds: ['fantasy'] }).enabledCollectionIds).toEqual(['fantasy']);

    const assignment = game.prompts.assign({ random: () => 0 });
    expect(assignment.prompt.id).toBe('dragon');
    expect(game.prompts.reroll({ currentPromptId: assignment.prompt.id, random: () => 0.99 }).prompt.id).toBe('robot');
    expect(game.prompts.evaluateGuess('dragon', 'drake')).toMatchObject({ correct: true, matchedBy: 'alias' });
  });

  it('resolves drawing game rules on the server runtime', () => {
    const game = createServerGameRuntime(CUSTOM_RULES_GAME_PACK);

    expect(game.rules.settings.roundTimerSeconds.options).toEqual([60, 75, 90]);
    expect(game.rules.features.reroll).toBe(false);
    expect(game.rules.scoring.drawerPointsPerCorrectGuess).toBe(25);
    expect(game.rules.scoring.scoreCorrectGuess({ elapsedMs: 30_000, roundDurationMs: 60_000 })).toBe(75);
    expect(game.rules.scoring.endRoundWhenAllGuessersCorrect).toBe(false);
    expect(game.rules.scoring.capRoundAfterFirstCorrectGuess).toBe(false);
    expect(game.settings.defaults()).toMatchObject({
      roundTimerSeconds: 60,
      firstCorrectGuessTimeCapSeconds: 15,
      guessingDelaySeconds: 10,
      turnsPerPlayer: 2,
    });
    expect(game.settings.validate({ ...game.settings.defaults(), roundTimerSeconds: 75 })).toBe(true);
    expect(game.settings.validate({ ...game.settings.defaults(), roundTimerSeconds: 120 })).toBe(false);
    expect(game.settings.firstCorrectGuessCaps(60)).toEqual([15, 30, 45, 60]);
  });

  it('keeps custom prompt rules and prompt art resolution on the server runtime', () => {
    const game = createServerGameRuntime(CUSTOM_RULES_GAME_PACK);

    expect(game.prompts.assign({ random: () => 0 }).prompt.id).toBe('robot');
    expect(game.prompts.evaluateGuess('dragon', 'custom answer')).toMatchObject({ correct: true, matchedBy: 'custom' });
    expect(game.assets.promptArtUrl('dragon')).toBe('/custom-art/dragon.webp');
    expect(game.ui.copy.room.scoreboardHeader).toBe('Custom scores');
    expect(game.ui.theme.colors.primary).toBe('#123456');
  });

  it('returns static asset content types by extension', () => {
    expect(getShellStaticAssetContentType('Knight.PNG')).toBe('image/png');
    expect(getShellStaticAssetContentType('photo.jpeg')).toBe('image/jpeg');
    expect(getShellStaticAssetContentType('sprite.webp')).toBe('image/webp');
    expect(getShellStaticAssetContentType('icon.svg')).toBe('image/svg+xml');
    expect(getShellStaticAssetContentType('skin.css')).toBe('text/css');
    expect(getShellStaticAssetContentType('data.bin')).toBe('application/octet-stream');
  });

  it('renders shell index HTML from compiled web config', () => {
    expect(
      renderShellIndexHtml('<html><head><title>Old</title>  </head><body></body></html>', 'Test <Game>', {
        iconHref: '/icon".png',
        ui: createBrowserGameRuntimeManifest(TEST_GAME_PACK).ui,
      }),
    ).toBe(
      '<html><head><title>Test &lt;Game&gt;</title>    <link rel="icon" type="image/png" href="/icon&quot;.png" />\n  </head><body></body></html>',
    );
  });
});

describe('browser game runtime manifest', () => {
  it('returns browser-safe serializable game data, UI config, and asset hints', () => {
    const manifest = createBrowserGameRuntimeManifest(CUSTOM_RULES_GAME_PACK);

    expect(manifest.kind).toBe('browser');
    expect(manifest.definition).toBe(TEST_GAME_DEFINITION);
    expect(manifest.ui.copy.room.scoreboardHeader).toBe('Custom scores');
    expect(manifest.rules.settings.roundTimerSeconds.options).toEqual([60, 75, 90]);
    expect(manifest.rules.features.reroll).toBe(false);
    expect('scoring' in manifest.rules).toBe(false);
    expect(manifest.assets).toEqual({
      iconHref: '/custom-icon.png',
      publicBasePath: '/fallback-art',
    });
    expect('storage' in manifest).toBe(false);
    expect('promptArtUrl' in manifest.assets).toBe(false);
    expect('prompts' in manifest).toBe(false);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it('hydrates storage helpers from a serializable browser manifest', () => {
    const runtime = hydrateBrowserGameRuntime(createBrowserGameRuntimeManifest(CUSTOM_RULES_GAME_PACK));

    expect(runtime.storage.key('joined-session')).toBe('testgame.joined-session');
    expect(runtime.storage.key('userSettings', ':')).toBe('testgame:userSettings');
    expect(runtime.storage.cookie('preferred-nickname')).toBe('testgame-preferred-nickname');
  });

  it('renders a browser runtime module that exports the hydrated runtime contract', () => {
    const moduleCode = renderBrowserGameRuntimeModule(createBrowserGameRuntimeManifest(CUSTOM_RULES_GAME_PACK));

    expect(moduleCode).toContain('export const GAME_RUNTIME');
    expect(moduleCode).toContain('export const GAME_DEFINITION = GAME_RUNTIME.definition');
    expect(moduleCode).toContain('export const GAME_WEB_CONFIG = { iconHref: GAME_RUNTIME.assets.iconHref, ui: GAME_RUNTIME.ui }');
    expect(moduleCode).toContain('buildStorageKey');
  });

  it('compiles a shell app into explicit server, browser, and build artifacts', () => {
    const shell = compileShellApp(
      {
        game: CUSTOM_RULES_GAME_PACK,
        build: {
          assets: {
            sourceDir: './assets',
            publicBasePath: '/fallback-art',
          },
        },
      },
      { relativeSourceBaseUrl: new URL('./fixtures/', import.meta.url) },
    );

    expect(shell.config.game).toBe(CUSTOM_RULES_GAME_PACK);
    expect(shell.server.createRuntime().prompts.assign({ random: () => 0 }).prompt.id).toBe('robot');
    expect(shell.browser.manifestJson).toEqual(createBrowserGameRuntimeManifest(CUSTOM_RULES_GAME_PACK));
    expect(shell.browser.runtimeModuleCode).toBe(renderBrowserGameRuntimeModule(shell.browser.manifestJson));
    expect(JSON.stringify(shell.browser.manifestJson)).not.toContain('sourceDir');
    expect(shell.build.assets?.sourceDir.endsWith('/packages/common/src/fixtures/assets')).toBe(true);
    expect(shell.build.assets?.publicBasePath).toBe('/fallback-art/');
    expect(shell.assets.resolveRequest('/fallback-art/Robot.png')).toEqual({
      kind: 'asset',
      relativePath: 'Robot.png',
      contentType: 'image/png',
    });
    expect(shell.assets.resolveRequest('/fallback-art/../secret.txt')).toEqual({ kind: 'forbidden' });
    expect(shell.html.renderIndexHtml('<html><head><title>Old</title>  </head><body></body></html>')).toContain('<title>Test Game</title>');
  });

  it('creates a Sketcherson app with server adapter options and override precedence', () => {
    const app = createSketchersonApp({
      game: CUSTOM_RULES_GAME_PACK,
      server: {
        appOriginDefault: 'https://app.example',
        corsOriginDefault: 'https://cors.example',
        referenceArtEnabledDefault: false,
      },
    });

    const options = app.server.options({ corsOrigin: 'https://override.example' });

    expect(options.appOrigin).toBe('https://app.example');
    expect(options.corsOrigin).toBe('https://override.example');
    expect(options.referenceArtEnabled).toBe(false);
    expect(options.gameRuntime.prompts.assign({ random: () => 0 }).prompt.id).toBe('robot');
  });

  it('normalizes local asset mounts for build adapters', () => {
    expect(normalizeShellPublicBasePath(undefined)).toBeNull();
    expect(normalizeShellPublicBasePath('/')).toBeNull();
    expect(normalizeShellPublicBasePath('assets')).toBe('/assets/');
    expect(normalizeShellPublicBasePath('/assets')).toBe('/assets/');

    expect(resolveShellAssetSource('./assets', new URL('./fixtures/', import.meta.url))).toContain('/packages/common/src/fixtures/assets');

    const mount = resolveShellGameAssetMount({
      sourceDir: new URL('./fixtures/assets/', import.meta.url),
      publicBasePath: 'assets',
    });

    expect(mount?.sourceDir).toContain('/packages/common/src/fixtures/assets');
    expect(mount?.publicBasePath).toBe('/assets/');
  });

  it('resolves static asset requests for build adapters', () => {
    const mount = { sourceDir: '/repo/game/assets', publicBasePath: '/assets/' };

    expect(resolveShellStaticAssetRequest(mount, '/other/Knight.png')).toEqual({ kind: 'pass' });
    expect(resolveShellStaticAssetRequest(mount, '/assets/')).toEqual({ kind: 'pass' });
    expect(resolveShellStaticAssetRequest(mount, '/assets/Knight.png')).toEqual({
      kind: 'asset',
      relativePath: 'Knight.png',
      contentType: 'image/png',
    });
    expect(resolveShellStaticAssetRequest(mount, '/assets/skins/poke.css')).toEqual({
      kind: 'asset',
      relativePath: 'skins/poke.css',
      contentType: 'text/css',
    });
    expect(resolveShellStaticAssetRequest(mount, '/assets/../secret.txt')).toEqual({ kind: 'forbidden' });
  });

  it('identifies asset paths that escape the mounted source directory', () => {
    const directory = '/repo/game/assets';

    expect(isPathInsideDirectory(directory, '/repo/game/assets/Knight.png')).toBe(true);
    expect(isPathInsideDirectory(directory, '/repo/game/assets/nested/Archer.png')).toBe(true);
    expect(isPathInsideDirectory(directory, '/repo/game/secret.txt')).toBe(false);
  });
});
