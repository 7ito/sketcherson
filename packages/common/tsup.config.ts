import { defineConfig } from 'tsup';

const entries = [
  'src/index.ts',
  'src/game.ts',
  'src/vite.ts',
  'src/gamePack.ts',
  'src/gameRuntime.ts',
  'src/gameAuthoring.ts',
  'src/gameDefinition.ts',
  'src/prompts.ts',
  'src/settings.ts',
  'src/room.ts',
  'src/roomEvents.ts',
  'src/drawing.ts',
  'src/drawingProtocol.ts',
  'src/drawingRealtime.ts',
  'src/drawingRaster.ts',
  'src/identity.ts',
  'src/moderation.ts',
  'src/scoring.ts',
  'src/storage.ts',
  'src/games/testGame/index.ts'
];

export default defineConfig({
  entry: entries,
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: false,
  treeshake: true
});
