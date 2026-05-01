import { createBrowserGameRuntimeManifest, hydrateBrowserGameRuntime } from '@sketcherson/common/game';
import { DEMO_GAME_PACK } from '@sketcherson/demo-game';

export const GAME_RUNTIME = hydrateBrowserGameRuntime(createBrowserGameRuntimeManifest(DEMO_GAME_PACK));
export const GAME_DEFINITION = GAME_RUNTIME.definition;
export const GAME_WEB_CONFIG = { iconHref: GAME_RUNTIME.assets.iconHref, ui: GAME_RUNTIME.ui };
