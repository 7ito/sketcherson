import type { DrawingGameRulesConfig } from './drawingGameRules';
import type { AuthoredAudienceGame } from './gameAuthoring';
import type { GameDefinition } from './gameDefinition';
import type { PromptRules } from './promptEngine';
import type { PromptEntry } from './promptCatalog';

export interface GamePackAssetOptions<TPrompt extends PromptEntry = PromptEntry> {
  /**
   * Base browser path where game assets are served. Defaults to '/'.
   */
  publicBasePath?: string;
  /**
   * Browser href for the app icon/favicon.
   */
  iconHref?: string;
  /**
   * Optional resolver for prompt reference art. If omitted, the shell uses the prompt artFileName at publicBasePath.
   */
  resolvePromptArtUrl?: (prompt: TPrompt) => string | null;
}

export interface ShellThemeTokens {
  colors?: {
    primary?: string;
    primaryStrong?: string;
    primaryText?: string;
    accent?: string;
    accentStrong?: string;
    accentText?: string;
    background?: string;
    surface?: string;
    surfaceStrong?: string;
    border?: string;
    text?: string;
    mutedText?: string;
    success?: string;
    warning?: string;
    danger?: string;
  };
  playerAccentColors?: readonly string[];
}

export type ShellSkinPreset = 'arcade-dark' | 'clean-light' | 'poster-dark';

export interface ShellSkinIconTokens {
  createRoom?: string;
  joinRoom?: string;
  drawer?: string;
  connected?: string;
  disconnected?: string;
  reconnecting?: string;
  close?: string;
  correctGuess?: string;
  sendMessage?: string;
  referencePlaceholder?: string;
}

export interface ShellSkinTypographyTokens {
  displayFont?: string;
  bodyFont?: string;
  monoFont?: string;
}

export interface ShellSkinShapeTokens {
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  radiusPill?: string;
}

export interface ShellSkinEffectTokens {
  surfaceShadow?: string;
  buttonShadow?: string;
  focusRing?: string;
}

export interface ShellSkinTokens {
  colors?: ShellThemeTokens['colors'];
  playerAccentColors?: readonly string[];
  typography?: ShellSkinTypographyTokens;
  shape?: ShellSkinShapeTokens;
  effects?: ShellSkinEffectTokens;
  icons?: ShellSkinIconTokens;
}

export interface ShellSkinConfig {
  preset?: ShellSkinPreset;
  className?: string;
  cssHref?: string;
  tokens?: ShellSkinTokens;
}

export interface ResolvedShellSkinTokens {
  colors: Required<NonNullable<ShellThemeTokens['colors']>>;
  playerAccentColors: readonly string[];
  typography: Required<ShellSkinTypographyTokens>;
  shape: Required<ShellSkinShapeTokens>;
  effects: Required<ShellSkinEffectTokens>;
  icons: Required<ShellSkinIconTokens>;
}

export interface ResolvedShellSkinConfig {
  preset: ShellSkinPreset;
  className: string | null;
  cssHref: string | null;
  tokens: ResolvedShellSkinTokens;
}

export interface ShellCopyOverrides {
  common?: Partial<{
    roomCode: string;
    onlineCount: string;
    host: string;
    connected: string;
    reconnecting: string;
    kick: string;
    close: string;
    saving: string;
    noMessagesYet: string;
  }>;
  home?: Partial<{
    createRoomButton: string;
    joinRoomButton: string;
    roomCodeLabel: string;
    nicknameLabel: string;
    createSubmitting: string;
    joinSubmitting: string;
    actionDivider: string;
    closeDialog: string;
    policyPrefix: string;
  }>;
  room?: Partial<{
    lobbyStatus: string;
    playersHeader: string;
    waitingForPlayers: string;
    startGameButton: string;
    playAgainButton: string;
    scoreboardHeader: string;
    finalStandingsHeader: string;
    postgameTitle: string;
    chatHeader: string;
    chatAndGuessesHeader: string;
  }>;
  settings?: Partial<{
    roundTimerLabel: string;
    firstCorrectGuessTimeCapLabel: string;
    guessingDelayLabel: string;
    turnsPerPlayerLabel: string;
    referenceArtToggleLabel: string;
  }>;
  drawing?: Partial<{
    referenceImagePlaceholder: string;
    noDrawingCaptured: string;
  }>;
  drawingToolbar?: Partial<{
    colorsLabel: string;
    pickColor: string;
    penTitle: string;
    eraserTitle: string;
    fillTitle: string;
    undoTitle: string;
    redoTitle: string;
    clearTitle: string;
    brushSizeLabel: string;
    brushSize: string;
  }>;
  join?: Partial<{
    eyebrow: string;
    title: string;
    lobbySubtitle: string;
    liveMatchSubtitle: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    submitButton: string;
    submittingButton: string;
  }>;
  lobby?: Partial<{
    matchSettingsHeader: string;
    onlyHostCanChangeSettings: string;
    waitingForHostToStart: string;
    needMorePlayers: string;
    startSubmitting: string;
    chatPlaceholder: string;
    copyInviteLink: string;
    needMorePlayersToStart: string;
  }>;
  match?: Partial<{
    phaseCountdown: string;
    phaseActive: string;
    phaseReveal: string;
    phaseDone: string;
    phasePaused: string;
    phaseResuming: string;
    roundBadge: string;
    drawerTag: string;
    drawingLabel: string;
    hostLabel: string;
    promptHeader: string;
    promptOnlyYouCanSee: string;
    rerolling: string;
    rerolledFrom: string;
    revealResultHeader: string;
    drawnBy: string;
    noCorrectGuesses: string;
    guessingUnlocksHeader: string;
    guessingDelayHelper: string;
    pauseWindowHeader: string;
    pauseWindowRemaining: string;
    autoResumeHelper: string;
    hostControlsHeader: string;
    pauseMatch: string;
    pausingMatch: string;
    resumeMatch: string;
    resumeCountdown: string;
    pauseCooldownHelper: string;
    chatPlaceholderDrawer: string;
    chatPlaceholderGuesser: string;
    chatPlaceholderGuessingLocked: string;
    guessingDelayFooter: string;
    guessedBadge: string;
    waitBadge: string;
    nextRoundBadge: string;
    pausedBadge: string;
    kickLabel: string;
  }>;
  postgame?: Partial<{
    winner: string;
    gameOver: string;
    postgamePhase: string;
    youLabel: string;
    waitingForHost: string;
    rematchSettings: string;
    roundHeading: string;
    galleryByline: string;
    rerolledBadge: string;
    drawingAlt: string;
    chatPlaceholder: string;
    starting: string;
    needMorePlayersToRematch: string;
  }>;
  feed?: Partial<FeedCopy>;
}

export interface FeedCopy {
  playerJoined: string;
  roundHeader: string;
  drawerAssigned: string;
  answerRevealed: string;
  allGuessersCorrect: string;
  gamePaused: string;
  gameResumed: string;
  correctGuessSelf: string;
  correctGuessSelfWithPosition: string;
  correctGuessOther: string;
}

export type ShellCopyTokens = Record<string, string | number | null | undefined>;

export interface ShellNoticeConfig {
  id: string;
  label: string;
  shortText?: string;
  policyLabel?: string;
  policyUrl?: string;
  paragraphs?: readonly string[];
  placements?: readonly ('home-footer' | 'room-frame' | 'postgame-gallery')[];
}

export interface ShellPresentationConfig {
  layout?: {
    home?: {
      heroVariant?: 'centered' | 'split-card' | 'poster';
    };
    room?: {
      density?: 'compact' | 'comfortable' | 'spacious';
      showLobbyDrawing?: boolean;
      showPostgameGallery?: boolean;
    };
    match?: {
      infoPanelMode?: 'cards' | 'inline' | 'hidden';
      scoreboardMode?: 'ranked' | 'player-list';
    };
  };
  components?: {
    buttonStyle?: 'flat' | 'raised' | 'chunky';
    badgeStyle?: 'pill' | 'tag' | 'square';
    cardStyle?: 'glass' | 'solid' | 'outlined';
  };
}

export interface ResolvedShellPresentationConfig {
  layout: {
    home: Required<NonNullable<NonNullable<ShellPresentationConfig['layout']>['home']>>;
    room: Required<NonNullable<NonNullable<ShellPresentationConfig['layout']>['room']>>;
    match: Required<NonNullable<NonNullable<ShellPresentationConfig['layout']>['match']>>;
  };
  components: Required<NonNullable<ShellPresentationConfig['components']>>;
}

export interface GamePackUiDefaults {
  nicknamePlaceholders?: {
    create?: string;
    join?: string;
  };
  logo?: {
    parts?: readonly string[];
  };
  theme?: ShellThemeTokens;
  skin?: ShellSkinConfig;
  copy?: ShellCopyOverrides;
  presentation?: ShellPresentationConfig;
  notices?: readonly ShellNoticeConfig[];
}

export interface ResolvedShellUiConfig {
  logo: {
    parts: readonly string[];
    ariaLabel: string;
  };
  theme: {
    colors: Required<NonNullable<ShellThemeTokens['colors']>>;
    playerAccentColors: readonly string[];
  };
  skin: ResolvedShellSkinConfig;
  copy: {
    common: Required<NonNullable<ShellCopyOverrides['common']>>;
    home: Required<NonNullable<ShellCopyOverrides['home']>>;
    room: Required<NonNullable<ShellCopyOverrides['room']>>;
    settings: Required<NonNullable<ShellCopyOverrides['settings']>>;
    drawing: Required<NonNullable<ShellCopyOverrides['drawing']>>;
    drawingToolbar: Required<NonNullable<ShellCopyOverrides['drawingToolbar']>>;
    join: Required<NonNullable<ShellCopyOverrides['join']>>;
    lobby: Required<NonNullable<ShellCopyOverrides['lobby']>>;
    match: Required<NonNullable<ShellCopyOverrides['match']>>;
    postgame: Required<NonNullable<ShellCopyOverrides['postgame']>>;
    feed: Required<FeedCopy>;
  };
  presentation: ResolvedShellPresentationConfig;
  notices: readonly ShellNoticeConfig[];
  nicknamePlaceholders: {
    create: string;
    join: string;
  };
}

export type GameBuildAssetSource = string | URL;

export interface GameBuildAssetOptions {
  /**
   * Local filesystem asset source consumed by build tools. This must not be exposed to browser runtime code.
   */
  sourceDir?: GameBuildAssetSource;
  /**
   * Browser path where the asset source is served.
   */
  publicBasePath?: string;
}

export interface GameBuildConfig {
  assets?: GameBuildAssetOptions;
}

export interface GamePack<TPrompt extends PromptEntry = PromptEntry> {
  definition: GameDefinition<TPrompt>;
  assets?: GamePackAssetOptions<TPrompt>;
  promptRules?: PromptRules<TPrompt>;
  rules?: DrawingGameRulesConfig;
  ui?: GamePackUiDefaults;
}

export interface ShellWebConfig {
  iconHref?: string;
}

export interface ShellRuntimeWebConfig {
  iconHref?: string;
  ui: ResolvedShellUiConfig;
}

export interface ShellRuntimeConfig<TPrompt extends PromptEntry = PromptEntry> {
  game: GamePack<TPrompt>;
  web: ShellRuntimeWebConfig;
}

export type ShellAppGame<TPrompt extends PromptEntry = PromptEntry> = GamePack<TPrompt> | AuthoredAudienceGame<TPrompt>;

interface ShellAppBaseConfig<TPrompt extends PromptEntry = PromptEntry> {
  web?: ShellWebConfig;
  server?: {
    referenceArtEnabledDefault?: boolean;
    appOriginDefault?: string;
    corsOriginDefault?: string;
  };
}

export interface ShellAppConfig<TPrompt extends PromptEntry = PromptEntry> extends ShellAppBaseConfig<TPrompt> {
  game: GamePack<TPrompt>;
  build?: GameBuildConfig;
}

export interface ShellAppInputConfig<TPrompt extends PromptEntry = PromptEntry> extends ShellAppBaseConfig<TPrompt> {
  game: ShellAppGame<TPrompt>;
  build?: GameBuildConfig;
}

export function defineGamePack<TPrompt extends PromptEntry>(pack: GamePack<TPrompt>): GamePack<TPrompt> {
  return pack;
}

export function defineGameBuildConfig(config: GameBuildConfig): GameBuildConfig {
  return config;
}

function isAuthoredAudienceGame<TPrompt extends PromptEntry>(game: ShellAppGame<TPrompt>): game is AuthoredAudienceGame<TPrompt> {
  return 'pack' in game;
}

export function defineShellApp<TPrompt extends PromptEntry>(config: ShellAppInputConfig<TPrompt>): ShellAppConfig<TPrompt> {
  if (!isAuthoredAudienceGame(config.game)) {
    return config as ShellAppConfig<TPrompt>;
  }

  return {
    ...config,
    game: config.game.pack,
    build: config.build ?? config.game.build,
  };
}

export function resolveShellWebConfig<TPrompt extends PromptEntry>(config: ShellAppConfig<TPrompt>): ShellWebConfig {
  return {
    iconHref: config.web?.iconHref ?? config.game.assets?.iconHref,
  };
}

const DEFAULT_PLAYER_ACCENT_COLORS = ['#38bdf8', '#fb923c', '#22c55e', '#a855f7'] as const;

const SHELL_SKIN_PRESET_DEFAULTS: Record<ShellSkinPreset, Omit<ResolvedShellSkinTokens, 'colors' | 'playerAccentColors'>> = {
  'arcade-dark': {
    typography: { displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', monoFont: 'ui-monospace, SFMono-Regular, monospace' },
    shape: { radiusSm: '8px', radiusMd: '12px', radiusLg: '20px', radiusPill: '999px' },
    effects: { surfaceShadow: '0 24px 80px rgb(15 23 42 / 0.22)', buttonShadow: '0 12px 24px rgb(37 99 235 / 0.28)', focusRing: '0 0 0 3px rgb(59 130 246 / 0.35)' },
    icons: { createRoom: '✨', joinRoom: '🔗', drawer: '🎨', connected: '✓', disconnected: '⚠', reconnecting: '↻', close: '✕', correctGuess: '✓', sendMessage: '➤', referencePlaceholder: '🖼️' },
  },
  'clean-light': {
    typography: { displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', monoFont: 'ui-monospace, SFMono-Regular, monospace' },
    shape: { radiusSm: '6px', radiusMd: '10px', radiusLg: '16px', radiusPill: '999px' },
    effects: { surfaceShadow: '0 18px 50px rgb(15 23 42 / 0.12)', buttonShadow: '0 10px 18px rgb(15 23 42 / 0.12)', focusRing: '0 0 0 3px rgb(14 165 233 / 0.28)' },
    icons: { createRoom: '+', joinRoom: '↗', drawer: '✎', connected: '✓', disconnected: '!', reconnecting: '…', close: '×', correctGuess: '✓', sendMessage: '→', referencePlaceholder: '□' },
  },
  'poster-dark': {
    typography: { displayFont: 'Impact, Haettenschweiler, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', monoFont: 'ui-monospace, SFMono-Regular, monospace' },
    shape: { radiusSm: '10px', radiusMd: '16px', radiusLg: '28px', radiusPill: '999px' },
    effects: { surfaceShadow: '0 28px 90px rgb(0 0 0 / 0.35)', buttonShadow: '0 14px 0 rgb(0 0 0 / 0.22)', focusRing: '0 0 0 4px rgb(250 204 21 / 0.38)' },
    icons: { createRoom: '★', joinRoom: '●', drawer: '✏️', connected: '✓', disconnected: '⚠', reconnecting: '↻', close: '✕', correctGuess: '✓', sendMessage: '➤', referencePlaceholder: '?' },
  },
};

function resolveShellThemeColors<TPrompt extends PromptEntry>(gamePack: GamePack<TPrompt>): Required<NonNullable<ShellThemeTokens['colors']>> {
  const definition = gamePack.definition;
  const themeColors = gamePack.ui?.skin?.tokens?.colors ?? gamePack.ui?.theme?.colors ?? {};

  return {
    primary: themeColors.primary ?? definition.brand.colors.primary,
    primaryStrong: themeColors.primaryStrong ?? themeColors.primary ?? definition.brand.colors.primary,
    primaryText: themeColors.primaryText ?? '#ffffff',
    accent: themeColors.accent ?? definition.brand.colors.accent,
    accentStrong: themeColors.accentStrong ?? themeColors.accent ?? definition.brand.colors.accent,
    accentText: themeColors.accentText ?? '#111827',
    background: themeColors.background ?? '#0f172a',
    surface: themeColors.surface ?? '#ffffff',
    surfaceStrong: themeColors.surfaceStrong ?? '#f8fafc',
    border: themeColors.border ?? '#dbeafe',
    text: themeColors.text ?? '#0f172a',
    mutedText: themeColors.mutedText ?? '#64748b',
    success: themeColors.success ?? '#16a34a',
    warning: themeColors.warning ?? '#f59e0b',
    danger: themeColors.danger ?? '#dc2626',
  };
}

export function resolveShellSkinConfig<TPrompt extends PromptEntry>(gamePack: GamePack<TPrompt>): ResolvedShellSkinConfig {
  const skin = gamePack.ui?.skin;
  const preset = skin?.preset ?? 'arcade-dark';
  const presetDefaults = SHELL_SKIN_PRESET_DEFAULTS[preset];

  return {
    preset,
    className: skin?.className ?? null,
    cssHref: skin?.cssHref ?? null,
    tokens: {
      colors: resolveShellThemeColors(gamePack),
      playerAccentColors: skin?.tokens?.playerAccentColors ?? gamePack.ui?.theme?.playerAccentColors ?? DEFAULT_PLAYER_ACCENT_COLORS,
      typography: { ...presetDefaults.typography, ...skin?.tokens?.typography },
      shape: { ...presetDefaults.shape, ...skin?.tokens?.shape },
      effects: { ...presetDefaults.effects, ...skin?.tokens?.effects },
      icons: { ...presetDefaults.icons, ...skin?.tokens?.icons },
    },
  };
}

export function resolveShellUiConfig<TPrompt extends PromptEntry>(gamePack: GamePack<TPrompt>): ResolvedShellUiConfig {
  const definition = gamePack.definition;
  const skin = resolveShellSkinConfig(gamePack);
  const commonCopy = gamePack.ui?.copy?.common ?? {};
  const homeCopy = gamePack.ui?.copy?.home ?? {};
  const roomCopy = gamePack.ui?.copy?.room ?? {};
  const settingsCopy = gamePack.ui?.copy?.settings ?? {};
  const drawingCopy = gamePack.ui?.copy?.drawing ?? {};
  const drawingToolbarCopy = gamePack.ui?.copy?.drawingToolbar ?? {};
  const joinCopy = gamePack.ui?.copy?.join ?? {};
  const lobbyCopy = gamePack.ui?.copy?.lobby ?? {};
  const matchCopy = gamePack.ui?.copy?.match ?? {};
  const postgameCopy = gamePack.ui?.copy?.postgame ?? {};
  const feedCopy = gamePack.ui?.copy?.feed ?? {};
  const presentation = gamePack.ui?.presentation ?? {};

  return {
    logo: {
      parts: gamePack.ui?.logo?.parts ?? definition.brand.logoText,
      ariaLabel: definition.title,
    },
    theme: {
      colors: skin.tokens.colors,
      playerAccentColors: skin.tokens.playerAccentColors,
    },
    skin,
    copy: {
      common: {
        roomCode: commonCopy.roomCode ?? 'Room Code',
        onlineCount: commonCopy.onlineCount ?? '{count} online',
        host: commonCopy.host ?? 'Host',
        connected: commonCopy.connected ?? 'Connected',
        reconnecting: commonCopy.reconnecting ?? 'Reconnecting',
        kick: commonCopy.kick ?? 'Kick',
        close: commonCopy.close ?? 'Close',
        saving: commonCopy.saving ?? 'Saving…',
        noMessagesYet: commonCopy.noMessagesYet ?? 'No messages yet.',
      },
      home: {
        createRoomButton: homeCopy.createRoomButton ?? 'Create Room',
        joinRoomButton: homeCopy.joinRoomButton ?? 'Join Room',
        roomCodeLabel: homeCopy.roomCodeLabel ?? 'Room Code',
        nicknameLabel: homeCopy.nicknameLabel ?? 'Your Name',
        createSubmitting: homeCopy.createSubmitting ?? 'Creating…',
        joinSubmitting: homeCopy.joinSubmitting ?? 'Joining…',
        actionDivider: homeCopy.actionDivider ?? 'OR',
        closeDialog: homeCopy.closeDialog ?? 'Close',
        policyPrefix: homeCopy.policyPrefix ?? 'Policy:',
      },
      room: {
        lobbyStatus: roomCopy.lobbyStatus ?? 'Lobby',
        playersHeader: roomCopy.playersHeader ?? 'Players',
        waitingForPlayers: roomCopy.waitingForPlayers ?? 'Waiting for players...',
        startGameButton: roomCopy.startGameButton ?? 'Start game',
        playAgainButton: roomCopy.playAgainButton ?? 'Play again',
        scoreboardHeader: roomCopy.scoreboardHeader ?? 'Scoreboard',
        finalStandingsHeader: roomCopy.finalStandingsHeader ?? 'Final standings',
        postgameTitle: roomCopy.postgameTitle ?? 'Thanks for playing!',
        chatHeader: roomCopy.chatHeader ?? 'Chat',
        chatAndGuessesHeader: roomCopy.chatAndGuessesHeader ?? 'Chat & Guesses',
      },
      settings: {
        roundTimerLabel: settingsCopy.roundTimerLabel ?? 'Round timer',
        firstCorrectGuessTimeCapLabel: settingsCopy.firstCorrectGuessTimeCapLabel ?? 'First Guess Time Reduction',
        guessingDelayLabel: settingsCopy.guessingDelayLabel ?? 'Guessing delay',
        turnsPerPlayerLabel: settingsCopy.turnsPerPlayerLabel ?? 'Turns per player',
        referenceArtToggleLabel: settingsCopy.referenceArtToggleLabel ?? definition.terminology.referenceArtLabel,
      },
      drawing: {
        referenceImagePlaceholder: drawingCopy.referenceImagePlaceholder ?? `No ${definition.terminology.referenceArtLabel} available`,
        noDrawingCaptured: drawingCopy.noDrawingCaptured ?? 'No drawing captured',
      },
      drawingToolbar: {
        colorsLabel: drawingToolbarCopy.colorsLabel ?? 'Drawing colors',
        pickColor: drawingToolbarCopy.pickColor ?? 'Pick color {color}',
        penTitle: drawingToolbarCopy.penTitle ?? 'Pen (B)',
        eraserTitle: drawingToolbarCopy.eraserTitle ?? 'Eraser (E)',
        fillTitle: drawingToolbarCopy.fillTitle ?? 'Fill (F)',
        undoTitle: drawingToolbarCopy.undoTitle ?? 'Undo (Ctrl+Z)',
        redoTitle: drawingToolbarCopy.redoTitle ?? 'Redo (Ctrl+Shift+Z / Ctrl+Y)',
        clearTitle: drawingToolbarCopy.clearTitle ?? 'Clear',
        brushSizeLabel: drawingToolbarCopy.brushSizeLabel ?? 'Brush size',
        brushSize: drawingToolbarCopy.brushSize ?? 'Brush size {size}',
      },
      join: {
        eyebrow: joinCopy.eyebrow ?? 'Join private room',
        title: joinCopy.title ?? 'Room {roomCode}',
        lobbySubtitle: joinCopy.lobbySubtitle ?? 'Pick a guest nickname to enter the live lobby.',
        liveMatchSubtitle: joinCopy.liveMatchSubtitle ?? 'A match is already in progress. Join now to appear on the live scoreboard, guess starting next round, and get a tail draw turn when eligible.',
        nicknameLabel: joinCopy.nicknameLabel ?? 'Nickname',
        nicknamePlaceholder: joinCopy.nicknamePlaceholder ?? 'Your name',
        submitButton: joinCopy.submitButton ?? 'Join room',
        submittingButton: joinCopy.submittingButton ?? 'Joining…',
      },
      lobby: {
        matchSettingsHeader: lobbyCopy.matchSettingsHeader ?? 'Match Settings',
        onlyHostCanChangeSettings: lobbyCopy.onlyHostCanChangeSettings ?? 'Only the host can change settings.',
        waitingForHostToStart: lobbyCopy.waitingForHostToStart ?? 'Waiting for the host to start the game.',
        needMorePlayers: lobbyCopy.needMorePlayers ?? 'Need {count} more',
        startSubmitting: lobbyCopy.startSubmitting ?? 'Starting…',
        chatPlaceholder: lobbyCopy.chatPlaceholder ?? 'Chat with the room…',
        copyInviteLink: lobbyCopy.copyInviteLink ?? 'Copy invite link',
        needMorePlayersToStart: lobbyCopy.needMorePlayersToStart ?? 'Need {minPlayers}+ connected players to start.',
      },
      match: {
        phaseCountdown: matchCopy.phaseCountdown ?? 'Countdown',
        phaseActive: matchCopy.phaseActive ?? 'Active',
        phaseReveal: matchCopy.phaseReveal ?? 'Reveal',
        phaseDone: matchCopy.phaseDone ?? 'Done',
        phasePaused: matchCopy.phasePaused ?? 'Paused',
        phaseResuming: matchCopy.phaseResuming ?? 'Resuming',
        roundBadge: matchCopy.roundBadge ?? 'Round {currentRound}/{totalRounds}',
        drawerTag: matchCopy.drawerTag ?? '{drawerIcon} {drawerNickname} is drawing',
        drawingLabel: matchCopy.drawingLabel ?? 'Drawing',
        hostLabel: matchCopy.hostLabel ?? 'Host',
        promptHeader: matchCopy.promptHeader ?? 'Your {PromptNoun}',
        promptOnlyYouCanSee: matchCopy.promptOnlyYouCanSee ?? 'Only you can see this',
        rerolling: matchCopy.rerolling ?? 'Rerolling…',
        rerolledFrom: matchCopy.rerolledFrom ?? 'Rerolled from: {previousPrompt}',
        revealResultHeader: matchCopy.revealResultHeader ?? 'Round result',
        drawnBy: matchCopy.drawnBy ?? 'Drawn by {drawerNickname}',
        noCorrectGuesses: matchCopy.noCorrectGuesses ?? 'No correct guesses this round.',
        guessingUnlocksHeader: matchCopy.guessingUnlocksHeader ?? 'Guessing unlocks',
        guessingDelayHelper: matchCopy.guessingDelayHelper ?? 'Guessers cannot chat or submit answers until the delay expires.',
        pauseWindowHeader: matchCopy.pauseWindowHeader ?? 'Pause window',
        pauseWindowRemaining: matchCopy.pauseWindowRemaining ?? '{seconds}s remaining',
        autoResumeHelper: matchCopy.autoResumeHelper ?? 'Auto-resumes when pause limit is reached.',
        hostControlsHeader: matchCopy.hostControlsHeader ?? 'Host controls',
        pauseMatch: matchCopy.pauseMatch ?? 'Pause match',
        pausingMatch: matchCopy.pausingMatch ?? 'Pausing…',
        resumeMatch: matchCopy.resumeMatch ?? 'Resume match',
        resumeCountdown: matchCopy.resumeCountdown ?? 'Resume countdown…',
        pauseCooldownHelper: matchCopy.pauseCooldownHelper ?? 'Unlocks in {seconds}s',
        chatPlaceholderDrawer: matchCopy.chatPlaceholderDrawer ?? 'Chat with the room…',
        chatPlaceholderGuesser: matchCopy.chatPlaceholderGuesser ?? 'Type your guess…',
        chatPlaceholderGuessingLocked: matchCopy.chatPlaceholderGuessingLocked ?? 'Guessing opens in {seconds}s…',
        guessingDelayFooter: matchCopy.guessingDelayFooter ?? 'Guessing opens in {seconds}s.',
        guessedBadge: matchCopy.guessedBadge ?? 'Guessed',
        waitBadge: matchCopy.waitBadge ?? 'Wait {seconds}s',
        nextRoundBadge: matchCopy.nextRoundBadge ?? 'Next round',
        pausedBadge: matchCopy.pausedBadge ?? 'Paused',
        kickLabel: matchCopy.kickLabel ?? 'Kick',
      },
      postgame: {
        winner: postgameCopy.winner ?? 'GG, the winner is {nickname}',
        gameOver: postgameCopy.gameOver ?? 'Game over',
        postgamePhase: postgameCopy.postgamePhase ?? 'Postgame',
        youLabel: postgameCopy.youLabel ?? 'You',
        waitingForHost: postgameCopy.waitingForHost ?? 'Waiting for the host.',
        rematchSettings: postgameCopy.rematchSettings ?? 'Rematch settings',
        roundHeading: postgameCopy.roundHeading ?? 'Round {roundNumber}',
        galleryByline: postgameCopy.galleryByline ?? 'by {drawerNickname}',
        rerolledBadge: postgameCopy.rerolledBadge ?? 'Rerolled',
        drawingAlt: postgameCopy.drawingAlt ?? 'Drawing of {answer}',
        chatPlaceholder: postgameCopy.chatPlaceholder ?? 'Type to chat…',
        starting: postgameCopy.starting ?? 'Starting…',
        needMorePlayersToRematch: postgameCopy.needMorePlayersToRematch ?? 'Need {minPlayers}+ connected players.',
      },
      feed: {
        playerJoined: feedCopy.playerJoined ?? '{nickname} joined the lobby.',
        roundHeader: feedCopy.roundHeader ?? 'Round {roundNumber}',
        drawerAssigned: feedCopy.drawerAssigned ?? '{drawerNickname} is now drawing.',
        answerRevealed: feedCopy.answerRevealed ?? 'The {promptNoun} was {answer}.',
        allGuessersCorrect: feedCopy.allGuessersCorrect ?? 'Everyone guessed the {promptNoun}.',
        gamePaused: feedCopy.gamePaused ?? 'The game has been paused.',
        gameResumed: feedCopy.gameResumed ?? 'The game has been unpaused.',
        correctGuessSelf: feedCopy.correctGuessSelf ?? 'You were correct! The {promptNoun} was {answer}.',
        correctGuessSelfWithPosition: feedCopy.correctGuessSelfWithPosition ?? 'You were correct! The {promptNoun} was {answer}. ({guessPosition} / {totalGuessers})',
        correctGuessOther: feedCopy.correctGuessOther ?? '{nickname} got the {promptNoun}!',
      },
    },
    presentation: {
      layout: {
        home: {
          heroVariant: presentation.layout?.home?.heroVariant ?? 'centered',
        },
        room: {
          density: presentation.layout?.room?.density ?? 'comfortable',
          showLobbyDrawing: presentation.layout?.room?.showLobbyDrawing ?? true,
          showPostgameGallery: presentation.layout?.room?.showPostgameGallery ?? true,
        },
        match: {
          infoPanelMode: presentation.layout?.match?.infoPanelMode ?? 'cards',
          scoreboardMode: presentation.layout?.match?.scoreboardMode ?? 'ranked',
        },
      },
      components: {
        buttonStyle: presentation.components?.buttonStyle ?? 'raised',
        badgeStyle: presentation.components?.badgeStyle ?? 'pill',
        cardStyle: presentation.components?.cardStyle ?? 'solid',
      },
    },
    notices: gamePack.ui?.notices ?? [
      {
        id: 'legal-notice',
        label: definition.legalNotice.label,
        shortText: definition.legalNotice.shortText,
        policyLabel: definition.legalNotice.policyLabel,
        policyUrl: definition.legalNotice.policyUrl,
        paragraphs: definition.legalNotice.paragraphs,
        placements: ['home-footer', 'room-frame', 'postgame-gallery'],
      },
    ],
    nicknamePlaceholders: {
      create: gamePack.ui?.nicknamePlaceholders?.create ?? 'Player One',
      join: gamePack.ui?.nicknamePlaceholders?.join ?? 'Player Two',
    },
  };
}

export function formatShellCopy(template: string, tokens: ShellCopyTokens): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, tokenName: string) => {
    const directValue = tokens[tokenName];
    if (directValue !== null && directValue !== undefined) {
      return String(directValue);
    }

    const lowerFirstTokenName = tokenName.charAt(0).toLowerCase() + tokenName.slice(1);
    const lowerFirstValue = tokens[lowerFirstTokenName];
    if (tokenName !== lowerFirstTokenName && lowerFirstValue !== null && lowerFirstValue !== undefined) {
      const value = String(lowerFirstValue);
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    return '';
  });
}

export function resolveShellRuntimeConfig<TPrompt extends PromptEntry>(config: ShellAppConfig<TPrompt>): ShellRuntimeConfig<TPrompt> {
  return {
    game: config.game,
    web: {
      ...resolveShellWebConfig(config),
      ui: resolveShellUiConfig(config.game),
    },
  };
}

export function resolveGamePackPromptArtUrl<TPrompt extends PromptEntry>(
  gamePack: GamePack<TPrompt>,
  prompt: TPrompt | null | undefined,
): string | null {
  if (!prompt) {
    return null;
  }

  const resolvedUrl = gamePack.assets?.resolvePromptArtUrl?.(prompt);
  if (resolvedUrl !== undefined) {
    return resolvedUrl;
  }

  if (!prompt.artFileName) {
    return null;
  }

  const publicBasePath = gamePack.assets?.publicBasePath ?? '/';
  const normalizedBasePath = publicBasePath.endsWith('/') ? publicBasePath : `${publicBasePath}/`;
  return `${normalizedBasePath}${encodeURIComponent(prompt.artFileName)}`;
}
