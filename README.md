# Sketcherson

Sketcherson is a reusable pictionary-style game shell. It includes shared game rules, prompt catalogs, a realtime server, and a React web client. Developers can fork it and replace the selected game pack to make an audience-targeted drawing game.

## Packages

- `packages/common`: generic game engine, runtime compilation, prompt engine, drawing protocol, and Vite integration.
- `packages/demo-game`: default copyright-safe demo game built with `defineAudienceGame()`.
- `apps/server`: Socket.IO game server.
- `apps/web`: React shell app compiled with `createSketchersonApp()` and `sketchersonVitePlugin()`.

## Run locally

```sh
npm install
npm run dev
```

The web app defaults to `http://localhost:5173` and the server defaults to port `3001`.

## Build and test

```sh
npm test
npm run build
```

## Documentation

1. [Game packs](docs/game-packs.md)
2. [Release reference](docs/releases.md)
3. [Publishing Sketcherson packages](docs/package-publication.md)
4. [Updating downstream games](docs/downstream-updates.md)

## Replace the game pack

Create a package under `packages/your-game`, export an authored game from `defineAudienceGame()`, then update `shell.config.ts`:

```ts
import { defineShellApp } from '@sketcherson/common/game';
import YOUR_GAME from '@your-scope/your-game';

export default defineShellApp({
  game: YOUR_GAME,
  server: {
    referenceArtEnabledDefault: true,
    appOriginDefault: 'http://localhost:5173',
    corsOriginDefault: 'http://localhost:5173',
  },
});
```

See `docs/game-packs.md` and `packages/demo-game` for a complete template with prompt collections, aliases, runtime-safe asset URLs, and build-only local asset wiring.
