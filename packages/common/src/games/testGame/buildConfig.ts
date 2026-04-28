import { defineGameBuildConfig } from '../../gamePack';

export const TEST_GAME_BUILD = defineGameBuildConfig({
  assets: {
    sourceDir: './test-assets',
    publicBasePath: '/test-assets',
  },
});
