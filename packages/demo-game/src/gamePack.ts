import type { GamePack } from '@sketcherson/common/game';
import { DEMO_GAME } from './gameDefinition';
import type { DemoPrompt } from './prompts';

export const DEMO_GAME_PACK = DEMO_GAME.pack satisfies GamePack<DemoPrompt>;
