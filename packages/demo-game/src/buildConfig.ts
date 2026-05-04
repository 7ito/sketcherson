import type { GameBuildConfig } from '@7ito/sketcherson-common/game';
import { DEMO_GAME } from './gameDefinition';

if (!DEMO_GAME.build) {
  throw new Error('Demo game authoring must provide build asset config.');
}

export const DEMO_GAME_BUILD = DEMO_GAME.build satisfies GameBuildConfig;
