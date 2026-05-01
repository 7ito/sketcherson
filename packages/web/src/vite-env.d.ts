declare module 'virtual:shell-runtime-config' {
  import type {
    BrowserGameRuntime,
    BrowserGameRuntimeManifestJson,
  } from '@sketcherson/common/gameRuntime';

  export const GAME_RUNTIME: BrowserGameRuntime;
  export const GAME_DEFINITION: BrowserGameRuntimeManifestJson['definition'];
  export const GAME_WEB_CONFIG: {
    iconHref: BrowserGameRuntime['assets']['iconHref'];
    ui: BrowserGameRuntime['ui'];
  };
}
