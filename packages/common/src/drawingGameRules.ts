import {
  FIRST_CORRECT_GUESS_TIME_CAP_PRESETS,
  GUESSING_DELAY_PRESETS,
  MAX_PLAYERS_PER_ROOM,
  MAX_TOTAL_TURNS,
  MIN_PLAYERS_TO_START,
  ROUND_TIMER_PRESETS,
  TURNS_PER_PLAYER_PRESETS,
  type FirstCorrectGuessTimeCapPreset,
  type GuessingDelayPreset,
  type RoundTimerPreset,
  type TurnsPerPlayerPreset,
} from './room';
import { calculateGuesserScore } from './scoring';

export interface GuesserScoreInput {
  elapsedMs: number;
  roundDurationMs: number;
}

export interface DrawingGameRulesConfig {
  preset?: 'classic';
  players?: {
    minToStart?: number;
    maxPerRoom?: number;
  };
  timers?: {
    roundSeconds?: readonly RoundTimerPreset[];
    defaultRoundSeconds?: RoundTimerPreset;
    firstCorrectGuessCaps?: readonly FirstCorrectGuessTimeCapPreset[];
    defaultFirstCorrectGuessCap?: FirstCorrectGuessTimeCapPreset;
    guessingDelaySeconds?: readonly GuessingDelayPreset[];
    defaultGuessingDelaySeconds?: GuessingDelayPreset;
  };
  turns?: {
    perPlayerOptions?: readonly TurnsPerPlayerPreset[];
    defaultTurnsPerPlayer?: TurnsPerPlayerPreset;
    maxTotalTurns?: number;
    rerollsPerTurn?: number;
  };
  scoring?: {
    drawerPointsPerCorrectGuess?: number;
    guesserPoints?: 'linear-100-to-30' | ((input: GuesserScoreInput) => number);
    endRoundWhenAllGuessersCorrect?: boolean;
    capRoundAfterFirstCorrectGuess?: boolean;
  };
  features?: {
    lobbyDrawing?: boolean;
    referenceArt?: 'drawer-and-reveal' | 'drawer-only' | 'disabled';
    pause?: boolean;
  };
}

export interface LobbySettingsRules {
  roundTimerSeconds: {
    options: readonly RoundTimerPreset[];
    default: RoundTimerPreset;
  };
  firstCorrectGuessTimeCapSeconds: {
    options: readonly FirstCorrectGuessTimeCapPreset[];
    default: FirstCorrectGuessTimeCapPreset;
  };
  guessingDelaySeconds: {
    options: readonly GuessingDelayPreset[];
    default: GuessingDelayPreset;
  };
  turnsPerPlayer: {
    options: readonly TurnsPerPlayerPreset[];
    default: TurnsPerPlayerPreset;
  };
}

export interface ResolvedDrawingGameRules {
  settings: LobbySettingsRules;
  limits: {
    minPlayersToStart: number;
    maxPlayersPerRoom: number;
    maxTotalTurns: number;
  };
  turns: {
    rerollsPerTurn: number;
  };
  scoring: {
    drawerPointsPerCorrectGuess: number;
    scoreCorrectGuess(input: GuesserScoreInput): number;
    endRoundWhenAllGuessersCorrect: boolean;
    capRoundAfterFirstCorrectGuess: boolean;
  };
  features: {
    lobbyDrawing: boolean;
    referenceArt: 'drawer-and-reveal' | 'drawer-only' | 'disabled';
    pause: boolean;
    reroll: boolean;
  };
}

export interface DrawingGameRulesManifest {
  settings: LobbySettingsRules;
  features: ResolvedDrawingGameRules['features'];
}

export function defineDrawingGameRules(config: DrawingGameRulesConfig): DrawingGameRulesConfig {
  return config;
}

export function resolveDrawingGameRules(config: DrawingGameRulesConfig = {}): ResolvedDrawingGameRules {
  const rerollsPerTurn = config.turns?.rerollsPerTurn ?? 1;
  const scoreCorrectGuess = config.scoring?.guesserPoints === undefined || config.scoring.guesserPoints === 'linear-100-to-30'
    ? (input: GuesserScoreInput) => calculateGuesserScore(input.elapsedMs, input.roundDurationMs)
    : config.scoring.guesserPoints;

  return {
    settings: {
      roundTimerSeconds: {
        options: config.timers?.roundSeconds ?? ROUND_TIMER_PRESETS,
        default: config.timers?.defaultRoundSeconds ?? 90,
      },
      firstCorrectGuessTimeCapSeconds: {
        options: config.timers?.firstCorrectGuessCaps ?? FIRST_CORRECT_GUESS_TIME_CAP_PRESETS,
        default: config.timers?.defaultFirstCorrectGuessCap ?? 30,
      },
      guessingDelaySeconds: {
        options: config.timers?.guessingDelaySeconds ?? GUESSING_DELAY_PRESETS,
        default: config.timers?.defaultGuessingDelaySeconds ?? 0,
      },
      turnsPerPlayer: {
        options: config.turns?.perPlayerOptions ?? TURNS_PER_PLAYER_PRESETS,
        default: config.turns?.defaultTurnsPerPlayer ?? 3,
      },
    },
    limits: {
      minPlayersToStart: config.players?.minToStart ?? MIN_PLAYERS_TO_START,
      maxPlayersPerRoom: config.players?.maxPerRoom ?? MAX_PLAYERS_PER_ROOM,
      maxTotalTurns: config.turns?.maxTotalTurns ?? MAX_TOTAL_TURNS,
    },
    turns: {
      rerollsPerTurn,
    },
    scoring: {
      drawerPointsPerCorrectGuess: config.scoring?.drawerPointsPerCorrectGuess ?? 50,
      scoreCorrectGuess,
      endRoundWhenAllGuessersCorrect: config.scoring?.endRoundWhenAllGuessersCorrect ?? true,
      capRoundAfterFirstCorrectGuess: config.scoring?.capRoundAfterFirstCorrectGuess ?? true,
    },
    features: {
      lobbyDrawing: config.features?.lobbyDrawing ?? true,
      referenceArt: config.features?.referenceArt ?? 'drawer-and-reveal',
      pause: config.features?.pause ?? true,
      reroll: rerollsPerTurn > 0,
    },
  };
}

export function createDrawingGameRulesManifest(rules: ResolvedDrawingGameRules): DrawingGameRulesManifest {
  return {
    settings: rules.settings,
    features: rules.features,
  };
}
