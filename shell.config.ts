import { defineShellApp } from '@sketcherson/common/gamePack';
import DEMO_GAME from './packages/demo-game/src';

const shellConfig = defineShellApp({
  game: DEMO_GAME,
  server: {
    referenceArtEnabledDefault: true,
    appOriginDefault: 'http://localhost:5173',
    corsOriginDefault: 'http://localhost:5173',
  },
});

export default shellConfig;
