import { defineAudienceGame } from '@7ito/sketcherson-common/gameAuthoring';
import type { GameDefinition } from '@7ito/sketcherson-common/gameDefinition';
import { DEMO_ASSET_PUBLIC_BASE_PATH, DEMO_PROMPT_CATALOG, type DemoPrompt } from './prompts';

export const DEMO_GAME = defineAudienceGame<DemoPrompt>({
  id: 'sketcherson-demo',
  title: 'Sketcherson Demo',
  tagline: 'Draw and guess a small set of original demo prompts with friends.',
  prompts: {
    collections: DEMO_PROMPT_CATALOG.collections,
    entries: DEMO_PROMPT_CATALOG.entries,
    fallbackPromptId: 'archer',
  },
  brand: {
    logoText: ['Sketcherson', 'Demo'],
    colors: {
      primary: '#6390e8',
      accent: '#e8873a',
    },
  },
  terminology: {
    promptNoun: 'prompt',
    promptPlural: 'prompts',
    collectionSingular: 'prompt set',
    collectionPlural: 'prompt sets',
    referenceArtLabel: 'reference sketch',
    answerLabel: 'Answer',
    rerollLabel: 'Reroll prompt',
  },
  legalNotice: {
    label: 'Demo content notice',
    shortText: 'Original demo prompts and reference sketches for development.',
    policyLabel: '',
    policyUrl: '',
    paragraphs: ['The demo game uses original, copyright-safe prompt data and simple SVG reference sketches.'],
  },
  storageNamespace: 'sketcherson-demo',
  assets: {
    localDir: new URL('../assets/', import.meta.url),
    publicBasePath: DEMO_ASSET_PUBLIC_BASE_PATH,
    iconFileName: 'demo-icon.svg',
  },
  ui: {
    nicknamePlaceholders: {
      create: 'DoodleHost',
      join: 'SketchGuest',
    },
    skin: {
      preset: 'arcade-dark',
      tokens: {
        typography: {
          displayFont: "'Trebuchet MS', 'Segoe UI', sans-serif",
        },
        icons: {
          createRoom: '✦',
          joinRoom: '→',
          drawer: '✏️',
          referencePlaceholder: '□',
        },
      },
    },
    theme: {
      colors: {
        primary: '#6390e8',
        primaryStrong: '#4a78d6',
        primaryText: '#ffffff',
        accent: '#e8873a',
        accentStrong: '#d47428',
        accentText: '#f0f0f0',
        background: '#111318',
        surface: '#1a1d24',
        surfaceStrong: '#22262e',
        border: '#2e3440',
        text: '#e0e4ec',
        mutedText: '#8892a4',
        success: '#3dba68',
        warning: '#e8a830',
        danger: '#e04848',
      },
      playerAccentColors: ['#6390e8', '#e8873a', '#3dba68', '#b07cf0'],
    },
  },
});

export const DEMO_GAME_DEFINITION: GameDefinition<DemoPrompt> = DEMO_GAME.pack.definition;
export default DEMO_GAME;
