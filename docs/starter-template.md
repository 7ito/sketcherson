# Starter game template

Use this template when creating a downstream Sketcherson game without copying framework source.

## Package layout

```txt
packages/my-game
  assets/
    placeholder.svg
  src/
    index.ts
  package.json
apps/server
apps/web
shell.config.ts
```

Only `packages/my-game` should contain game-specific prompts, aliases, references, styling, and metadata. The server and web apps should import reusable Sketcherson packages.

## Game package

`packages/my-game/package.json`:

```json
{
  "name": "@my-scope/my-game",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@7ito/sketcherson-common": "^0.1.0"
  }
}
```

`packages/my-game/src/index.ts`:

```ts
import { defineAudienceGame, resolveShellAssetSource } from '@7ito/sketcherson-common/game';

const assetBaseUrl = '/my-game-assets/';

export default defineAudienceGame({
  id: 'my-game',
  title: 'My Drawing Game',
  description: 'A focused prompt pack for my audience.',
  promptCollections: [
    {
      id: 'starter',
      title: 'Starter prompts',
      prompts: [
        {
          id: 'cozy-mug',
          text: 'Cozy mug',
          difficulty: 'easy',
          aliases: ['mug', 'cup'],
          art: {
            url: `${assetBaseUrl}placeholder.svg`,
            alt: 'Simple reference sketch for a cozy mug',
          },
        },
      ],
    },
  ],
  scoring: {
    closeGuessAward: 25,
    correctGuessAward: 100,
    drawerAward: 50,
  },
  round: {
    drawSeconds: 80,
    revealSeconds: 8,
  },
  build: {
    assets: resolveShellAssetSource('../assets', import.meta.url),
  },
});
```

## Shell config

`shell.config.ts`:

```ts
import { defineShellApp } from '@7ito/sketcherson-common/game';
import MY_GAME from './packages/my-game/src';

export default defineShellApp({
  game: MY_GAME,
  server: {
    referenceArtEnabledDefault: true,
    appOriginDefault: 'http://localhost:5173',
    corsOriginDefault: 'http://localhost:5173',
  },
});
```

## App dependencies

Downstream app packages should depend on Sketcherson packages rather than copied source files:

```json
{
  "dependencies": {
    "@7ito/sketcherson-common": "^0.1.0",
    "@7ito/sketcherson-server": "^0.1.0",
    "@7ito/sketcherson-web": "^0.1.0",
    "@my-scope/my-game": "*"
  }
}
```

## Validation checklist

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Run `npm run dev` and create a room.
5. Confirm the prompt appears only to the drawer.
6. Confirm reference art loads from the game asset mount.
7. Confirm guesses, close guess feedback, scoring, postgame, and rematch still work.

If a downstream game needs a copied shell change, create an upstream Sketcherson extension issue instead of copying framework code.
