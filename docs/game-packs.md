# Game packs

A game pack keeps audience-specific prompt data, copy, terminology, and asset URLs out of the reusable drawing-game shell.

## Primary authoring API

Use `defineAudienceGame()` for new games. It creates the runtime `GamePack` and optional build config from one browser-safe authoring boundary. Local asset paths only flow into `build`, not into the runtime pack.

```ts
import { defineAudienceGame } from '@7ito/sketcherson-common/game';
import { OBJECT_COLLECTIONS, OBJECT_PROMPTS } from './prompts';

export const EVERYDAY_OBJECTS_GAME = defineAudienceGame({
  id: 'everyday-objects',
  title: 'Everyday Objects',
  tagline: 'Draw and guess simple objects with friends.',
  prompts: {
    collections: OBJECT_COLLECTIONS,
    entries: OBJECT_PROMPTS,
    fallbackPromptId: 'coffee-mug',
  },
  brand: {
    colors: { primary: '#2563eb', accent: '#f97316' },
  },
  terminology: {
    promptNoun: 'object',
    promptPlural: 'objects',
    collectionSingular: 'object set',
    collectionPlural: 'object sets',
    referenceArtLabel: 'reference sketch',
    rerollLabel: 'Reroll object',
  },
  assets: {
    localDir: new URL('../assets/', import.meta.url),
    publicBasePath: '/object-assets/',
    iconFileName: 'icon.svg',
  },
  ui: {
    skin: {
      cssHref: '/object-assets/skin.css',
    },
    copy: {
      settings: {
        hideCloseGuessesFromOtherPlayersLabel: 'Hide close hints from other players',
        showCloseGuessAlertsLabel: 'Show close hint alerts',
      },
    },
  },
});
```

Defaults include `storageNamespace` from `id`, logo words from `title`, fallback prompt from the first enabled prompt, and prompt art URLs from `publicBasePath` plus `prompt.artFileName`.

Game-pack asset directories can include image files and CSS skins. Files referenced by `ui.skin.cssHref` are served from the same `publicBasePath` with a `text/css` content type in dev and after production asset copy.

## Included demo game

The repo includes `packages/demo-game` as the default selectable game pack. It uses a small original prompt catalog, aliases, and simple SVG reference sketches under `/demo-assets/`.

Use it as a template for a new audience game package:

```ts
import { defineShellApp } from '@7ito/sketcherson-common/game';
import DEMO_GAME from '@sketcherson/demo-game';

export default defineShellApp({
  game: DEMO_GAME,
});
```

## Selecting a game

Point the root shell config at the authored audience game. The shell compiler uses its runtime pack and build config together.

```ts
import { defineShellApp } from '@7ito/sketcherson-common/game';
import { EVERYDAY_OBJECTS_GAME } from './packages/everyday-objects-game/src';

export default defineShellApp({
  game: EVERYDAY_OBJECTS_GAME,
  server: {
    referenceArtEnabledDefault: true,
    appOriginDefault: 'http://localhost:5173',
    corsOriginDefault: 'http://localhost:5173',
  },
});
```

## Manual game packs

`defineGamePack()` and `defineGameBuildConfig()` remain available as advanced escape hatches when a game needs fully manual `GameDefinition`, runtime assets, or build asset wiring.

```ts
export default defineShellApp({
  game: EVERYDAY_OBJECTS_GAME.pack,
  build: EVERYDAY_OBJECTS_GAME.build,
});
```

Keep manual `GamePack` values browser-safe. They must not include local filesystem paths.

## Prompt display metadata

Prompt rules can provide stable browser-safe metadata for the drawer and reveal prompt panels. Use this for game-specific attributes such as types, generation, difficulty, or form labels.

```ts
export const EVERYDAY_OBJECTS_GAME = defineAudienceGame({
  // ...
  promptRules: {
    resolveDisplayMetadata: (prompt) => ({
      subtitle: 'Generation 1',
      badges: [{ label: 'fire', tone: 'warning' }],
      tags: ['starter'],
    }),
  },
});
```

Supported badge tones are `neutral`, `accent`, `success`, `warning`, and `danger`. Metadata is sanitized before it is exposed to clients.

## Close guess feedback

Games can mark an incorrect guess as close from `promptRules.evaluateGuess` by returning `closeGuess`. The optional `kind` lets downstream games classify why a guess is close. The optional `message` can be rendered in feed copy.

```ts
return {
  ...defaultResult,
  closeGuess: { kind: 'evolutionFamily', message: 'Same evolution family.' },
};
```

When close guess feedback is enabled, the shell exposes lobby settings for hiding close guesses from other players and showing close guess alerts. Override the labels with `ui.copy.settings.hideCloseGuessesFromOtherPlayersLabel` and `ui.copy.settings.showCloseGuessAlertsLabel`.

## Fuzzy guess helper

`isAcceptedFuzzyGuess(answer, guess)` is exported from `@7ito/sketcherson-common/prompts` for game packs that need to apply the shell's default fuzzy matching to custom prompt aliases or domain-specific guess resolution.

## Web extension slots

Game-specific React UI can be injected without forking `@7ito/sketcherson-web` by passing typed slots into `SketchersonWebApp` or `App`.

```tsx
import { SketchersonWebApp, type SketchersonWebSlots } from '@7ito/sketcherson-web';

const slots: SketchersonWebSlots = {
  homePageAddon: () => <p>Custom event rules</p>,
  promptReferencePanel: ({ visibility, room }) => (
    <aside>{visibility === 'drawer' ? room.match?.currentTurn?.prompt : 'Answer reveal'}</aside>
  ),
};

export function GameApp() {
  return <SketchersonWebApp slots={slots} />;
}
```

The default UI is used when a slot is omitted. The first supported slots are the home page addon and the prompt reference panel shown to the drawer or during reveal.

## Migration note

Existing callers that already pass `game: MY_GAME.pack` and `build: MY_GAME.build` can keep using that shape. New game packages should export the authored audience game and pass it directly as `game: MY_GAME`, which keeps runtime and build asset wiring selected together.
