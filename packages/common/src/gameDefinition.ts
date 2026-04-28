import type { PromptCatalog, PromptEntry } from './promptCatalog';

export interface GameDefinition<TPrompt extends PromptEntry = PromptEntry> {
  id: string;
  title: string;
  tagline: string;
  brand: {
    logoText: readonly string[];
    colors: {
      primary: string;
      accent: string;
    };
  };
  terminology: {
    promptNoun: string;
    promptPlural: string;
    collectionSingular: string;
    collectionPlural: string;
    referenceArtLabel: string;
    answerLabel: string;
    rerollLabel: string;
  };
  legalNotice: {
    label: string;
    shortText: string;
    policyLabel: string;
    policyUrl: string;
    paragraphs: readonly string[];
  };
  storageNamespace: string;
  promptCatalog: PromptCatalog<TPrompt>;
  fallbackPrompt: {
    id: string;
    name: string;
  };
}
