import { defineGamePack } from '../../gamePack';
import { TEST_GAME_DEFINITION, type TestGamePrompt } from './gameDefinition';

export const TEST_GAME_PACK = defineGamePack<TestGamePrompt>({
  definition: TEST_GAME_DEFINITION,
  assets: {
    publicBasePath: '/test-assets',
    iconHref: '/test-icon.png',
  },
  ui: {
    nicknamePlaceholders: {
      create: 'DragonDrawer',
      join: 'RobotGuesser',
    },
  },
});
