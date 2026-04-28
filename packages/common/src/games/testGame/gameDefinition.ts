import type { GameDefinition } from '../../gameDefinition';
import type { PromptCatalog, PromptEntry } from '../../promptCatalog';

export interface TestGamePrompt extends PromptEntry {
  difficulty: 'easy' | 'medium' | 'hard';
}

export const TEST_GAME_PROMPT_CATALOG: PromptCatalog<TestGamePrompt> = {
  collections: [
    {
      id: 'creatures',
      name: 'Creatures',
      description: 'Living things with distinct shapes.',
      enabledByDefault: true,
    },
    {
      id: 'objects',
      name: 'Objects',
      description: 'Everyday things and tools.',
      enabledByDefault: true,
    },
    {
      id: 'fantasy',
      name: 'Fantasy',
      description: 'Magic and myth prompts.',
      enabledByDefault: false,
    },
  ],
  entries: [
    {
      id: 'dragon',
      name: 'Dragon',
      aliases: ['drake'],
      enabled: true,
      artFileName: 'Dragon.png',
      collectionIds: ['creatures', 'fantasy'],
      difficulty: 'medium',
    },
    {
      id: 'robot',
      name: 'Robot',
      aliases: ['bot'],
      enabled: true,
      artFileName: 'Robot.png',
      collectionIds: ['objects'],
      difficulty: 'easy',
    },
    {
      id: 'wizard',
      name: 'Wizard',
      aliases: ['mage'],
      enabled: true,
      artFileName: null,
      collectionIds: ['fantasy'],
      difficulty: 'hard',
    },
  ],
};

export const TEST_GAME_DEFINITION: GameDefinition<TestGamePrompt> = {
  id: 'test-game',
  title: 'Test Game',
  tagline: 'A tiny shell validation game.',
  brand: {
    logoText: ['Test', 'Game'],
    colors: {
      primary: '#111111',
      accent: '#eeeeee',
    },
  },
  terminology: {
    promptNoun: 'prompt',
    promptPlural: 'prompts',
    collectionSingular: 'prompt pack',
    collectionPlural: 'prompt packs',
    referenceArtLabel: 'reference image',
    answerLabel: 'Answer',
    rerollLabel: 'Reroll prompt',
  },
  legalNotice: {
    label: 'Sample game notice',
    shortText: 'Sample game for shell validation.',
    policyLabel: 'example.com/policy',
    policyUrl: 'https://example.com/policy',
    paragraphs: ['Sample game for shell validation.'],
  },
  storageNamespace: 'testgame',
  promptCatalog: TEST_GAME_PROMPT_CATALOG,
  fallbackPrompt: {
    id: 'dragon',
    name: 'Dragon',
  },
};
