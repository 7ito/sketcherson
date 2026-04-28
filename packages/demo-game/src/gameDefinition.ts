import { defineAudienceGame } from '@sketcherson/common/gameAuthoring';
import type { GameDefinition } from '@sketcherson/common/gameDefinition';
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
      primary: '#2563eb',
      accent: '#f97316',
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
      preset: 'clean-light',
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
        primary: '#2563eb',
        primaryStrong: '#1d4ed8',
        primaryText: '#ffffff',
        accent: '#f97316',
        accentStrong: '#ea580c',
        accentText: '#111827',
        background: '#eff6ff',
        surface: '#ffffff',
        surfaceStrong: '#f8fafc',
        border: '#bfdbfe',
        text: '#172554',
        mutedText: '#64748b',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
      },
      playerAccentColors: ['#2563eb', '#f97316', '#22c55e', '#a855f7'],
    },
  },
});

export const DEMO_GAME_DEFINITION: GameDefinition<DemoPrompt> = DEMO_GAME.pack.definition;
export default DEMO_GAME;
