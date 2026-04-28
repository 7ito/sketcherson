import type { DrawingGameRulesConfig } from './drawingGameRules';
import type { GameDefinition } from './gameDefinition';
import type { GameBuildConfig, GamePack, GamePackUiDefaults } from './gamePack';
import type { PromptRules } from './promptEngine';
import type { PromptCollection, PromptEntry } from './promptCatalog';

export interface AudienceGameConfig<TPrompt extends PromptEntry> {
  id: string;
  storageNamespace?: string;
  title: string;
  tagline: string;
  prompts: {
    collections: readonly PromptCollection[];
    entries: readonly TPrompt[];
    fallbackPromptId?: string;
  };
  brand?: {
    logoText?: readonly string[];
    colors?: {
      primary: string;
      accent: string;
    };
  };
  terminology?: Partial<GameDefinition['terminology']>;
  legalNotice?: Partial<GameDefinition['legalNotice']>;
  assets?: {
    localDir?: URL | string;
    publicBasePath?: string;
    iconFileName?: string;
    iconHref?: string;
    promptArtFile?: (prompt: TPrompt) => string | null;
    promptArtUrl?: (prompt: TPrompt) => string | null;
  };
  ui?: GamePackUiDefaults;
  promptRules?: PromptRules<TPrompt>;
  rules?: DrawingGameRulesConfig;
}

export interface AuthoredAudienceGame<TPrompt extends PromptEntry> {
  pack: GamePack<TPrompt>;
  build?: GameBuildConfig;
}

const DEFAULT_TERMINOLOGY: GameDefinition['terminology'] = {
  promptNoun: 'prompt',
  promptPlural: 'prompts',
  collectionSingular: 'collection',
  collectionPlural: 'collections',
  referenceArtLabel: 'reference art',
  answerLabel: 'Answer',
  rerollLabel: 'Reroll prompt',
};

const DEFAULT_LEGAL_NOTICE: GameDefinition['legalNotice'] = {
  label: 'Notice',
  shortText: 'Free fan-made drawing game.',
  policyLabel: '',
  policyUrl: '',
  paragraphs: [],
};

function normalizePublicBasePath(publicBasePath: string): string {
  const prefixedPath = publicBasePath.startsWith('/') ? publicBasePath : `/${publicBasePath}`;
  return prefixedPath.endsWith('/') ? prefixedPath : `${prefixedPath}/`;
}

function defaultLogoText(title: string): readonly string[] {
  return title.trim().split(/\s+/).filter(Boolean);
}

function validateCollectionReferences<TPrompt extends PromptEntry>(config: AudienceGameConfig<TPrompt>): void {
  const collectionIds = new Set(config.prompts.collections.map((collection) => collection.id));
  const unknownReferences = config.prompts.entries.flatMap((prompt) =>
    prompt.collectionIds.filter((collectionId) => !collectionIds.has(collectionId)).map((collectionId) => `${prompt.id}:${collectionId}`),
  );

  if (unknownReferences.length > 0) {
    throw new Error(`Unknown prompt collection ids in audience game "${config.id}": ${unknownReferences.join(', ')}`);
  }
}

function resolveFallbackPrompt<TPrompt extends PromptEntry>(config: AudienceGameConfig<TPrompt>): { id: string; name: string } {
  const fallbackPromptId = config.prompts.fallbackPromptId;
  const fallbackPrompt = fallbackPromptId
    ? config.prompts.entries.find((prompt) => prompt.enabled && prompt.id === fallbackPromptId)
    : config.prompts.entries.find((prompt) => prompt.enabled);

  if (!fallbackPrompt) {
    const reason = fallbackPromptId ? `fallback prompt id "${fallbackPromptId}" was not found or is disabled` : 'no enabled prompts are available';
    throw new Error(`Invalid audience game "${config.id}": ${reason}.`);
  }

  return { id: fallbackPrompt.id, name: fallbackPrompt.name };
}

export function defineAudienceGame<TPrompt extends PromptEntry>(config: AudienceGameConfig<TPrompt>): AuthoredAudienceGame<TPrompt> {
  validateCollectionReferences(config);

  const publicBasePath = config.assets?.publicBasePath;
  const normalizedPublicBasePath = publicBasePath ? normalizePublicBasePath(publicBasePath) : undefined;
  const iconHref = config.assets?.iconHref ?? (config.assets?.iconFileName && normalizedPublicBasePath ? `${normalizedPublicBasePath}${encodeURIComponent(config.assets.iconFileName)}` : undefined);

  const definition: GameDefinition<TPrompt> = {
    id: config.id,
    title: config.title,
    tagline: config.tagline,
    brand: {
      logoText: config.brand?.logoText ?? defaultLogoText(config.title),
      colors: config.brand?.colors ?? { primary: '#2563eb', accent: '#facc15' },
    },
    terminology: { ...DEFAULT_TERMINOLOGY, ...config.terminology },
    legalNotice: { ...DEFAULT_LEGAL_NOTICE, ...config.legalNotice },
    storageNamespace: config.storageNamespace ?? config.id,
    promptCatalog: {
      collections: config.prompts.collections as PromptCollection[],
      entries: config.prompts.entries as TPrompt[],
    },
    fallbackPrompt: resolveFallbackPrompt(config),
  };

  const pack: GamePack<TPrompt> = {
    definition,
    ...(normalizedPublicBasePath || iconHref || config.assets?.promptArtUrl || config.assets?.promptArtFile
      ? {
          assets: {
            ...(normalizedPublicBasePath ? { publicBasePath: normalizedPublicBasePath } : {}),
            ...(iconHref ? { iconHref } : {}),
            resolvePromptArtUrl: (prompt: TPrompt) => {
              const customUrl = config.assets?.promptArtUrl?.(prompt);
              if (customUrl !== undefined) {
                return customUrl;
              }
              const artFile = config.assets?.promptArtFile?.(prompt) ?? prompt.artFileName ?? null;
              return artFile && normalizedPublicBasePath ? `${normalizedPublicBasePath}${encodeURIComponent(artFile)}` : null;
            },
          },
        }
      : {}),
    ...(config.promptRules ? { promptRules: config.promptRules } : {}),
    ...(config.rules ? { rules: config.rules } : {}),
    ...(config.ui ? { ui: config.ui } : {}),
  };

  return {
    pack,
    ...(config.assets?.localDir ? { build: { assets: { sourceDir: config.assets.localDir, ...(normalizedPublicBasePath ? { publicBasePath: normalizedPublicBasePath } : {}) } } } : {}),
  };
}
