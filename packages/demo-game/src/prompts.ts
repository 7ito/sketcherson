import type { PromptCatalog, PromptCollection, PromptEntry } from '@sketcherson/common/prompts';

export type DemoPromptKind = 'character' | 'prop' | 'quick-mark';

export const DEMO_ASSET_PUBLIC_BASE_PATH = '/demo-assets/';

export interface DemoPrompt extends PromptEntry {
  kind: DemoPromptKind;
  artFileName: string;
}

export const DEMO_COLLECTIONS: PromptCollection[] = [
  {
    id: 'troop',
    name: 'Characters',
    description: 'People and creatures with recognizable silhouettes.',
    enabledByDefault: true,
  },
  {
    id: 'building',
    name: 'Props',
    description: 'Simple objects and scene pieces for quick rounds.',
    enabledByDefault: true,
  },
  {
    id: 'spell',
    name: 'Quick marks',
    description: 'Fast shapes, symbols, and motion prompts.',
    enabledByDefault: true,
  },
];

export const DEMO_PROMPTS: DemoPrompt[] = [
  {
    id: 'archer',
    name: 'Archer',
    aliases: ['bowman'],
    enabled: true,
    kind: 'character',
    artFileName: 'Archer.svg',
    collectionIds: ['troop'],
  },
  {
    id: 'arrows',
    name: 'Arrows',
    aliases: ['arrow'],
    enabled: true,
    kind: 'quick-mark',
    artFileName: 'Arrows.svg',
    collectionIds: ['spell'],
  },
  {
    id: 'dragon',
    name: 'Dragon',
    aliases: ['drake'],
    enabled: true,
    kind: 'character',
    artFileName: 'Dragon.svg',
    collectionIds: ['troop'],
  },
  {
    id: 'musketeer',
    name: 'Musketeer',
    aliases: ['guard'],
    enabled: true,
    kind: 'character',
    artFileName: 'Musketeer.svg',
    collectionIds: ['troop'],
  },
  {
    id: 'goblin-cage',
    name: 'Goblin Cage',
    aliases: ['creature cage'],
    enabled: true,
    kind: 'prop',
    artFileName: 'Goblin Cage.svg',
    collectionIds: ['building'],
  },
  {
    id: 'zap',
    name: 'Zap',
    aliases: [],
    enabled: true,
    kind: 'quick-mark',
    artFileName: 'Zap.svg',
    collectionIds: ['spell'],
  },
];

export const DEMO_PROMPT_CATALOG: PromptCatalog<DemoPrompt> = {
  collections: DEMO_COLLECTIONS,
  entries: DEMO_PROMPTS,
};
