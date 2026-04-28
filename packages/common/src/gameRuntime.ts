import { createDrawingGameRulesManifest, resolveDrawingGameRules, type DrawingGameRulesManifest, type ResolvedDrawingGameRules } from './drawingGameRules';
import type { GameDefinition } from './gameDefinition';
import type { GameBuildAssetOptions, GameBuildAssetSource, GamePack, ResolvedShellUiConfig, ShellAppConfig, ShellRuntimeWebConfig } from './gamePack';
import { resolveGamePackPromptArtUrl, resolveShellUiConfig, resolveShellWebConfig } from './gamePack';
import type { PromptEngine } from './promptEngine';
import { createPromptEngine } from './promptEngine';
import type { PromptEntry } from './promptCatalog';
import type { FirstCorrectGuessTimeCapPreset, LobbySettings, RoundTimerPreset } from './room';
import {
  areLobbySettingsValidForGame,
  defaultLobbySettingsForGame,
  getFirstCorrectGuessTimeCapPresets,
  normalizeLobbySettingsForGame,
} from './settings';
import { buildGameCookieName, buildGameStorageKey } from './storage';

export type SerializableGameDefinition<TPrompt extends PromptEntry = PromptEntry> = GameDefinition<TPrompt>;

export interface ServerGameRuntime<TPrompt extends PromptEntry = PromptEntry> {
  readonly kind: 'server';
  readonly pack: GamePack<TPrompt>;
  readonly definition: GameDefinition<TPrompt>;
  readonly prompts: PromptEngine<TPrompt>;
  readonly rules: ResolvedDrawingGameRules;
  readonly settings: {
    defaults(): LobbySettings;
    normalize(settings: LobbySettings): LobbySettings;
    validate(settings: LobbySettings): boolean;
    firstCorrectGuessCaps(roundTimerSeconds: RoundTimerPreset): FirstCorrectGuessTimeCapPreset[];
  };
  readonly ui: {
    config(): ResolvedShellUiConfig;
    readonly copy: ResolvedShellUiConfig['copy'];
    readonly theme: ResolvedShellUiConfig['theme'];
  };
  readonly storage: {
    key(key: string, separator?: string): string;
    cookie(name: string): string;
  };
  readonly assets: {
    iconHref(): string | undefined;
    promptArtUrl(promptId: string): string | null;
  };
}

export interface BrowserGameRuntimeManifestJson<TPrompt extends PromptEntry = PromptEntry> {
  readonly kind: 'browser';
  readonly definition: SerializableGameDefinition<TPrompt>;
  readonly ui: ResolvedShellUiConfig;
  readonly rules: DrawingGameRulesManifest;
  readonly assets: {
    iconHref?: string;
    publicBasePath?: string;
  };
}

export interface BrowserGameRuntime<TPrompt extends PromptEntry = PromptEntry>
  extends BrowserGameRuntimeManifestJson<TPrompt> {
  readonly storage: {
    key(key: string, separator?: string): string;
    cookie(name: string): string;
  };
}

/** @deprecated Use BrowserGameRuntimeManifestJson for serialized data or BrowserGameRuntime for hydrated browser runtime. */
export type BrowserGameRuntimeManifest<TPrompt extends PromptEntry = PromptEntry> = BrowserGameRuntime<TPrompt>;

export interface ShellGameAssetMount {
  readonly sourceDir: string;
  readonly publicBasePath: string;
}

export interface ShellAssetCompilerOptions {
  readonly relativeSourceBaseUrl?: URL;
}

export interface ShellStaticAssetRequest {
  readonly kind: 'asset' | 'forbidden' | 'pass';
  readonly relativePath?: string;
  readonly contentType?: string;
}

export interface CreateGameServerOptions<TPrompt extends PromptEntry = PromptEntry> {
  readonly appOrigin?: string;
  readonly corsOrigin?: string;
  readonly referenceArtEnabled?: boolean;
  readonly gameRuntime: ServerGameRuntime<TPrompt>;
}

export interface CompiledShellApp<TPrompt extends PromptEntry = PromptEntry> {
  readonly config: ShellAppConfig<TPrompt>;
  readonly server: {
    createRuntime(): ServerGameRuntime<TPrompt>;
    options(overrides?: Partial<CreateGameServerOptions<TPrompt>>): CreateGameServerOptions<TPrompt>;
    defaults: NonNullable<ShellAppConfig<TPrompt>['server']>;
  };
  readonly browser: {
    manifestJson: BrowserGameRuntimeManifestJson<TPrompt>;
    runtimeModuleCode: string;
    web: ShellRuntimeWebConfig;
  };
  readonly build: {
    assets: ShellGameAssetMount | null;
  };
  readonly assets: {
    resolveRequest(requestPath: string): ShellStaticAssetRequest;
  };
  readonly html: {
    renderIndexHtml(html: string): string;
  };
}

export function createServerGameRuntime<TPrompt extends PromptEntry>(
  gamePack: GamePack<TPrompt>,
): ServerGameRuntime<TPrompt> {
  const definition = gamePack.definition;
  const prompts = createPromptEngine(gamePack);
  const uiConfig = resolveShellUiConfig(gamePack);
  const rules = resolveDrawingGameRules(gamePack.rules);

  return {
    kind: 'server',
    pack: gamePack,
    definition,
    prompts,
    rules,
    settings: {
      defaults: () => defaultLobbySettingsForGame(definition, rules),
      normalize: (settings) => normalizeLobbySettingsForGame(definition, settings, rules),
      validate: (settings) => areLobbySettingsValidForGame(definition, settings, rules),
      firstCorrectGuessCaps: (roundTimerSeconds) => getFirstCorrectGuessTimeCapPresets(roundTimerSeconds, rules),
    },
    ui: {
      config: () => uiConfig,
      copy: uiConfig.copy,
      theme: uiConfig.theme,
    },
    storage: {
      key: (key, separator) => buildGameStorageKey(definition, key, separator),
      cookie: (name) => buildGameCookieName(definition, name),
    },
    assets: {
      iconHref: () => gamePack.assets?.iconHref,
      promptArtUrl: (promptId) => resolveGamePackPromptArtUrl(gamePack, prompts.getPromptById(promptId)),
    },
  };
}

export function createBrowserGameRuntimeManifest<TPrompt extends PromptEntry>(
  gamePack: GamePack<TPrompt>,
): BrowserGameRuntimeManifestJson<TPrompt> {
  return {
    kind: 'browser',
    definition: gamePack.definition,
    ui: resolveShellUiConfig(gamePack),
    rules: createDrawingGameRulesManifest(resolveDrawingGameRules(gamePack.rules)),
    assets: {
      iconHref: gamePack.assets?.iconHref,
      publicBasePath: gamePack.assets?.publicBasePath,
    },
  };
}

export function hydrateBrowserGameRuntime<TPrompt extends PromptEntry>(
  manifest: BrowserGameRuntimeManifestJson<TPrompt>,
): BrowserGameRuntime<TPrompt> {
  return {
    ...manifest,
    storage: {
      key: (key, separator) => buildGameStorageKey(manifest.definition, key, separator),
      cookie: (name) => buildGameCookieName(manifest.definition, name),
    },
  };
}

export function renderBrowserGameRuntimeModule<TPrompt extends PromptEntry>(
  manifest: BrowserGameRuntimeManifestJson<TPrompt>,
): string {
  const serializedManifest = JSON.stringify(manifest);

  return `const runtimeManifest = ${serializedManifest};\nconst buildStorageKey = (key, separator = '.') => runtimeManifest.definition.storageNamespace + separator + key;\nconst buildCookieName = (name) => runtimeManifest.definition.storageNamespace + '-' + name;\nexport const GAME_RUNTIME = {\n  ...runtimeManifest,\n  storage: {\n    key: buildStorageKey,\n    cookie: buildCookieName,\n  },\n};\nexport const GAME_DEFINITION = GAME_RUNTIME.definition;\nexport const GAME_WEB_CONFIG = { iconHref: GAME_RUNTIME.assets.iconHref, ui: GAME_RUNTIME.ui };\n`;
}

function fileUrlToPath(url: URL): string {
  if (url.protocol !== 'file:') {
    throw new Error(`Expected a file URL for shell asset source, received ${url.href}`);
  }

  return decodeURIComponent(url.pathname);
}

function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];

  for (const part of path.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return `${absolute ? '/' : ''}${parts.join('/')}`;
}

export function resolveShellAssetSource(source: GameBuildAssetSource, relativeSourceBaseUrl: URL): string {
  if (source instanceof URL) {
    return fileUrlToPath(source);
  }

  return fileUrlToPath(new URL(source.replace(/^\.\//, ''), relativeSourceBaseUrl));
}

export function normalizeShellPublicBasePath(publicBasePath: string | undefined): string | null {
  if (!publicBasePath || publicBasePath === '/') {
    return null;
  }

  const prefixedPath = publicBasePath.startsWith('/') ? publicBasePath : `/${publicBasePath}`;
  return prefixedPath.endsWith('/') ? prefixedPath : `${prefixedPath}/`;
}

export function isPathInsideDirectory(directory: string, filePath: string): boolean {
  const normalizedDirectory = normalizePath(directory).replace(/\/+$/g, '');
  const normalizedFilePath = normalizePath(filePath);
  return normalizedFilePath === normalizedDirectory || normalizedFilePath.startsWith(`${normalizedDirectory}/`);
}

export function resolveShellGameAssetMount(
  assets: GameBuildAssetOptions | undefined,
  options: ShellAssetCompilerOptions = {},
): ShellGameAssetMount | null {
  const sourceDir = assets?.sourceDir;
  const publicBasePath = normalizeShellPublicBasePath(assets?.publicBasePath);

  if (!sourceDir || !publicBasePath) {
    return null;
  }

  const relativeSourceBaseUrl = options.relativeSourceBaseUrl ?? new URL('../../', import.meta.url);

  return {
    sourceDir: normalizePath(resolveShellAssetSource(sourceDir, relativeSourceBaseUrl)),
    publicBasePath,
  };
}

export function getShellStaticAssetContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith('.png')) {
    return 'image/png';
  }

  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (lowerPath.endsWith('.gif')) {
    return 'image/gif';
  }

  if (lowerPath.endsWith('.webp')) {
    return 'image/webp';
  }

  if (lowerPath.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  return 'application/octet-stream';
}

export function resolveShellStaticAssetRequest(mount: ShellGameAssetMount, requestPath: string): ShellStaticAssetRequest {
  if (!requestPath.startsWith(mount.publicBasePath)) {
    return { kind: 'pass' };
  }

  const relativePath = decodeURIComponent(requestPath.slice(mount.publicBasePath.length));
  if (!relativePath || relativePath.endsWith('/')) {
    return { kind: 'pass' };
  }

  const assetPath = normalizePath(`${mount.sourceDir}/${relativePath}`);
  if (!isPathInsideDirectory(mount.sourceDir, assetPath)) {
    return { kind: 'forbidden' };
  }

  return {
    kind: 'asset',
    relativePath,
    contentType: getShellStaticAssetContentType(assetPath),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderShellIndexHtml(html: string, title: string, web: ShellRuntimeWebConfig): string {
  const iconLink = web.iconHref
    ? `    <link rel="icon" type="image/png" href="${escapeHtml(web.iconHref)}" />\n`
    : '';

  const htmlWithTitle = html.replace(/<title>.*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  return htmlWithTitle.replace('  </head>', `${iconLink}  </head>`);
}

export function compileShellApp<TPrompt extends PromptEntry>(
  config: ShellAppConfig<TPrompt>,
  options: ShellAssetCompilerOptions = {},
): CompiledShellApp<TPrompt> {
  const manifestJson = createBrowserGameRuntimeManifest(config.game);
  const web = {
    ...resolveShellWebConfig(config),
    ui: resolveShellUiConfig(config.game),
  };
  const buildAssets = resolveShellGameAssetMount(config.build?.assets, options);

  const createRuntime = () => createServerGameRuntime(config.game);

  return {
    config,
    server: {
      createRuntime,
      options: (overrides = {}) => ({
        appOrigin: overrides.appOrigin ?? config.server?.appOriginDefault,
        corsOrigin: overrides.corsOrigin ?? config.server?.corsOriginDefault,
        referenceArtEnabled: overrides.referenceArtEnabled ?? config.server?.referenceArtEnabledDefault,
        gameRuntime: overrides.gameRuntime ?? createRuntime(),
      }),
      defaults: {
        referenceArtEnabledDefault: config.server?.referenceArtEnabledDefault,
        appOriginDefault: config.server?.appOriginDefault,
        corsOriginDefault: config.server?.corsOriginDefault,
      },
    },
    browser: {
      manifestJson,
      runtimeModuleCode: renderBrowserGameRuntimeModule(manifestJson),
      web,
    },
    build: {
      assets: buildAssets,
    },
    assets: {
      resolveRequest: (requestPath) => (buildAssets ? resolveShellStaticAssetRequest(buildAssets, requestPath) : { kind: 'pass' }),
    },
    html: {
      renderIndexHtml: (html) => renderShellIndexHtml(html, config.game.definition.title, web),
    },
  };
}

export const createSketchersonApp = compileShellApp;
