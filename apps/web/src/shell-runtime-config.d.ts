declare module 'virtual:shell-runtime-config' {
  import type { BrowserGameRuntime, ShellRuntimeWebConfig } from '@sketcherson/common/game';

  export const GAME_RUNTIME: BrowserGameRuntime;
  export const GAME_DEFINITION: BrowserGameRuntime['definition'];
  export const GAME_WEB_CONFIG: ShellRuntimeWebConfig;
}
