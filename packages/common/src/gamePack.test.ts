import { describe, expect, it } from 'vitest';
import {
  defineGameBuildConfig,
  defineGamePack,
  defineShellApp,
  resolveGamePackPromptArtUrl,
  resolveShellRuntimeConfig,
  resolveShellSkinConfig,
  resolveShellUiConfig,
  resolveShellWebConfig,
  formatShellCopy,
} from './gamePack';
import { TEST_GAME_DEFINITION, TEST_GAME_PACK } from './games/testGame';

describe('shell app config', () => {
  it('uses selected game pack icon as the web default', () => {
    const config = defineShellApp({
      game: TEST_GAME_PACK,
      build: defineGameBuildConfig({
        assets: {
          sourceDir: './build-assets',
          publicBasePath: '/build-assets/',
        },
      }),
    });

    expect(resolveShellWebConfig(config)).toEqual({
      iconHref: '/test-icon.png',
    });
  });

  it('lets app-level web config override the runtime icon', () => {
    const config = defineShellApp({
      game: TEST_GAME_PACK,
      build: defineGameBuildConfig({
        assets: {
          sourceDir: './build-assets',
        },
      }),
      web: {
        iconHref: '/custom-icon.png',
      },
    });

    expect(resolveShellWebConfig(config)).toEqual({
      iconHref: '/custom-icon.png',
    });
  });

  it('does not expose build-only asset sources through runtime config', () => {
    const config = defineShellApp({
      game: TEST_GAME_PACK,
      build: defineGameBuildConfig({
        assets: {
          sourceDir: new URL('./test-assets/', import.meta.url),
          publicBasePath: '/test-assets/',
        },
      }),
    });

    const runtimeConfig = resolveShellRuntimeConfig(config);

    expect(runtimeConfig.web).toMatchObject({
      iconHref: '/test-icon.png',
      ui: {
        logo: {
          parts: ['Test', 'Game'],
          ariaLabel: 'Test Game',
        },
      },
    });
    expect(runtimeConfig.game.assets).toEqual({
      publicBasePath: '/test-assets',
      iconHref: '/test-icon.png',
    });
    expect(JSON.stringify(runtimeConfig)).not.toContain('sourceDir');
  });

  it('supports CDN-only game packs without local build assets', () => {
    const cdnGamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      assets: {
        publicBasePath: 'https://cdn.example/game/',
        iconHref: 'https://cdn.example/game/icon.png',
        resolvePromptArtUrl: (prompt) => `https://cdn.example/game/${encodeURIComponent(prompt.artFileName ?? prompt.id)}`,
      },
    });
    const config = defineShellApp({
      game: cdnGamePack,
    });

    expect(resolveShellWebConfig(config)).toEqual({
      iconHref: 'https://cdn.example/game/icon.png',
    });
    expect(resolveGamePackPromptArtUrl(cdnGamePack, TEST_GAME_DEFINITION.promptCatalog.entries[0])).toBe(
      'https://cdn.example/game/Dragon.png',
    );
    expect(resolveShellRuntimeConfig(config).game.assets).toEqual(cdnGamePack.assets);
  });

  it('resolves complete UI defaults from the selected game pack', () => {
    const uiConfig = resolveShellUiConfig(TEST_GAME_PACK);

    expect(uiConfig).toMatchObject({
      logo: {
        parts: ['Test', 'Game'],
        ariaLabel: 'Test Game',
      },
      theme: {
        colors: {
          primary: '#111111',
          primaryStrong: '#111111',
          accent: '#eeeeee',
          accentStrong: '#eeeeee',
        },
      },
      copy: {
        common: {
          roomCode: 'Room Code',
          onlineCount: '{count} online',
          host: 'Host',
          connected: 'Connected',
          reconnecting: 'Reconnecting',
          kick: 'Kick',
          close: 'Close',
          saving: 'Saving…',
          noMessagesYet: 'No messages yet.',
        },
        home: {
          createRoomButton: 'Create Room',
          joinRoomButton: 'Join Room',
          actionDivider: 'OR',
          closeDialog: 'Close',
          policyPrefix: 'Policy:',
        },
        room: {
          playersHeader: 'Players',
          startGameButton: 'Start game',
          postgameTitle: 'Thanks for playing!',
          chatAndGuessesHeader: 'Chat & Guesses',
        },
        settings: {
          firstCorrectGuessTimeCapLabel: 'First Guess Time Reduction',
          hideCloseGuessesFromOtherPlayersLabel: 'Hide close guesses from other players',
          showCloseGuessAlertsLabel: 'Show close guess alerts',
          referenceArtToggleLabel: 'reference image',
        },
        join: {
          eyebrow: 'Join private room',
          title: 'Room {roomCode}',
          lobbySubtitle: 'Pick a guest nickname to enter the live lobby.',
          liveMatchSubtitle: expect.stringContaining('match is already in progress'),
          nicknameLabel: 'Nickname',
          nicknamePlaceholder: 'Your name',
          submitButton: 'Join room',
          submittingButton: 'Joining…',
        },
        lobby: {
          matchSettingsHeader: 'Match Settings',
          onlyHostCanChangeSettings: 'Only the host can change settings.',
          waitingForHostToStart: 'Waiting for the host to start the game.',
          needMorePlayers: 'Need {count} more',
          startSubmitting: 'Starting…',
          chatPlaceholder: 'Chat with the room…',
          copyInviteLink: 'Copy invite link',
          needMorePlayersToStart: 'Need {minPlayers}+ connected players to start.',
        },
        match: {
          phaseCountdown: 'Countdown',
          phaseActive: 'Active',
          phaseReveal: 'Reveal',
          phaseDone: 'Done',
          phasePaused: 'Paused',
          phaseResuming: 'Resuming',
          roundBadge: 'Round {currentRound}/{totalRounds}',
          drawerTag: '{drawerIcon} {drawerNickname} is drawing',
          drawingLabel: 'Drawing',
          hostLabel: 'Host',
          promptHeader: 'Your {PromptNoun}',
          promptOnlyYouCanSee: 'Only you can see this',
          rerolling: 'Rerolling…',
          rerolledFrom: 'Rerolled from: {previousPrompt}',
          revealResultHeader: 'Round result',
          drawnBy: 'Drawn by {drawerNickname}',
          noCorrectGuesses: 'No correct guesses this round.',
          guessingUnlocksHeader: 'Guessing unlocks',
          guessingDelayHelper: 'Guessers cannot chat or submit answers until the delay expires.',
          pauseWindowHeader: 'Pause window',
          pauseWindowRemaining: '{seconds}s remaining',
          autoResumeHelper: 'Auto-resumes when pause limit is reached.',
          hostControlsHeader: 'Host controls',
          pauseMatch: 'Pause match',
          pausingMatch: 'Pausing…',
          resumeMatch: 'Resume match',
          resumeCountdown: 'Resume countdown…',
          pauseCooldownHelper: 'Unlocks in {seconds}s',
          chatPlaceholderDrawer: 'Chat with the room…',
          chatPlaceholderGuesser: 'Type your guess…',
          chatPlaceholderGuessingLocked: 'Guessing opens in {seconds}s…',
          guessingDelayFooter: 'Guessing opens in {seconds}s.',
          guessedBadge: 'Guessed',
          waitBadge: 'Wait {seconds}s',
          nextRoundBadge: 'Next round',
          pausedBadge: 'Paused',
          kickLabel: 'Kick',
        },
        feed: {
          answerRevealed: 'The {promptNoun} was {answer}.',
          allGuessersCorrect: 'Everyone guessed the {promptNoun}.',
          correctGuessOther: '{nickname} got the {promptNoun}!',
        },
      },
      presentation: {
        layout: {
          home: { heroVariant: 'centered' },
          room: { density: 'comfortable', showLobbyDrawing: true, showPostgameGallery: true },
          match: { infoPanelMode: 'cards', scoreboardMode: 'ranked' },
        },
        components: { buttonStyle: 'raised', badgeStyle: 'pill', cardStyle: 'solid' },
      },
      nicknamePlaceholders: {
        create: 'DragonDrawer',
        join: 'RobotGuesser',
      },
    });
    expect(uiConfig.notices).toEqual([
      {
        id: 'legal-notice',
        label: 'Sample game notice',
        shortText: 'Sample game for shell validation.',
        policyLabel: 'example.com/policy',
        policyUrl: 'https://example.com/policy',
        paragraphs: ['Sample game for shell validation.'],
        placements: ['home-footer', 'room-frame', 'postgame-gallery'],
      },
    ]);
  });

  it('resolves serializable skin defaults and game overrides', () => {
    const customGamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      ui: {
        skin: {
          preset: 'poster-dark',
          className: 'demo-skin',
          cssHref: '/game-assets/demo-skin.css',
          tokens: {
            colors: { primary: '#ef4444' },
            playerAccentColors: ['#ef4444'],
            typography: { displayFont: '"Luckiest Guy", system-ui' },
            shape: { radiusLg: '24px' },
            icons: { createRoom: '⚡', reconnecting: '⟳', close: '×', sendMessage: '➤' },
          },
        },
      },
    });

    expect(resolveShellSkinConfig(customGamePack)).toMatchObject({
      preset: 'poster-dark',
      className: 'demo-skin',
      cssHref: '/game-assets/demo-skin.css',
      tokens: {
        colors: {
          primary: '#ef4444',
          accent: '#eeeeee',
        },
        playerAccentColors: ['#ef4444'],
        typography: {
          displayFont: '"Luckiest Guy", system-ui',
          bodyFont: 'Inter, system-ui, sans-serif',
        },
        shape: {
          radiusLg: '24px',
          radiusPill: '999px',
        },
        icons: {
          createRoom: '⚡',
          reconnecting: '⟳',
          close: '×',
          sendMessage: '➤',
        },
      },
    });
  });

  it('keeps theme as a compatibility alias for resolved skin tokens', () => {
    const uiConfig = resolveShellUiConfig(TEST_GAME_PACK);

    expect(uiConfig.skin.preset).toBe('arcade-dark');
    expect(uiConfig.theme.colors).toEqual(uiConfig.skin.tokens.colors);
    expect(uiConfig.theme.playerAccentColors).toEqual(uiConfig.skin.tokens.playerAccentColors);
  });

  it('formats shell copy tokens without crashing on missing optional values', () => {
    expect(formatShellCopy('The {promptNoun} was {answer}. ({guessPosition} / {totalGuessers})', {
      promptNoun: 'card',
      answer: 'Hog Rider',
      guessPosition: undefined,
      totalGuessers: null,
    })).toBe('The card was Hog Rider. ( / )');
  });

  it('formats capitalized shell copy tokens from lower-case token values', () => {
    expect(formatShellCopy('Your {PromptNoun} from {promptPlural}', {
      promptNoun: 'creature',
      promptPlural: 'creatures',
    })).toBe('Your Creature from creatures');
  });

  it('lets game packs override shell UI copy, presentation, theme, logo, notices, and placeholders', () => {
    const customGamePack = defineGamePack({
      definition: TEST_GAME_DEFINITION,
      ui: {
        nicknamePlaceholders: {
          create: 'HostName',
        },
        logo: {
          parts: ['Custom', 'Logo', 'Parts'],
        },
        theme: {
          colors: {
            primary: '#ff0000',
            accentText: '#222222',
          },
          playerAccentColors: ['#ff0000', '#00ff00'],
        },
        presentation: {
          layout: {
            home: { heroVariant: 'poster' },
            room: { density: 'compact', showLobbyDrawing: false },
            match: { infoPanelMode: 'inline', scoreboardMode: 'player-list' },
          },
          components: {
            buttonStyle: 'chunky',
            badgeStyle: 'tag',
          },
        },
        copy: {
          common: {
            host: 'Leader',
            kick: 'Remove',
          },
          home: {
            createRoomButton: 'Create Lobby',
          },
          join: {
            eyebrow: 'Enter the arena',
            submitButton: 'Battle!',
          },
          lobby: {
            matchSettingsHeader: 'Battle Settings',
            chatPlaceholder: 'Talk to your squad…',
          },
          match: {
            chatPlaceholderGuesser: 'Name that Pokémon…',
            drawerTag: '{drawerIcon} {drawerNickname} is sketching',
          },
          settings: {
            hideCloseGuessesFromOtherPlayersLabel: 'Hide private close guesses',
            showCloseGuessAlertsLabel: 'Show private close alerts',
          },
          drawing: {
            referenceImagePlaceholder: 'Reference sprite goes here',
          },
        },
        notices: [],
      },
    });

    expect(resolveShellUiConfig(customGamePack)).toMatchObject({
      logo: {
        parts: ['Custom', 'Logo', 'Parts'],
      },
      theme: {
        colors: {
          primary: '#ff0000',
          accent: '#eeeeee',
          accentText: '#222222',
        },
        playerAccentColors: ['#ff0000', '#00ff00'],
      },
      copy: {
        common: {
          host: 'Leader',
          kick: 'Remove',
          roomCode: 'Room Code',
          connected: 'Connected',
        },
        home: {
          createRoomButton: 'Create Lobby',
          joinRoomButton: 'Join Room',
        },
        join: {
          eyebrow: 'Enter the arena',
          submitButton: 'Battle!',
          nicknameLabel: 'Nickname',
        },
        lobby: {
          matchSettingsHeader: 'Battle Settings',
          chatPlaceholder: 'Talk to your squad…',
          onlyHostCanChangeSettings: 'Only the host can change settings.',
        },
        match: {
          chatPlaceholderGuesser: 'Name that Pokémon…',
          drawerTag: '{drawerIcon} {drawerNickname} is sketching',
          phaseCountdown: 'Countdown',
          hostControlsHeader: 'Host controls',
        },
        settings: {
          hideCloseGuessesFromOtherPlayersLabel: 'Hide private close guesses',
          showCloseGuessAlertsLabel: 'Show private close alerts',
        },
        drawing: {
          referenceImagePlaceholder: 'Reference sprite goes here',
        },
      },
      presentation: {
        layout: {
          home: { heroVariant: 'poster' },
          room: { density: 'compact', showLobbyDrawing: false, showPostgameGallery: true },
          match: { infoPanelMode: 'inline', scoreboardMode: 'player-list' },
        },
        components: { buttonStyle: 'chunky', badgeStyle: 'tag', cardStyle: 'solid' },
      },
      notices: [],
      nicknamePlaceholders: {
        create: 'HostName',
        join: 'Player Two',
      },
    });
  });
});
