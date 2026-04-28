import { render, screen } from '@testing-library/react';
import { buildShellSkinClassName, buildShellSkinStyle, buildShellThemeStyle, ShellThemeProvider } from '../components/ShellThemeProvider';
import { GAME_WEB_CONFIG } from '../game';

describe('ShellThemeProvider', () => {
  it('maps resolved shell theme colors to CSS variables', () => {
    expect(buildShellThemeStyle()).toMatchObject({
      '--shell-color-primary': GAME_WEB_CONFIG.ui.theme.colors.primary,
      '--shell-color-accent': GAME_WEB_CONFIG.ui.theme.colors.accent,
      '--shell-color-background': GAME_WEB_CONFIG.ui.theme.colors.background,
      '--shell-color-border': GAME_WEB_CONFIG.ui.theme.colors.border,
    });
  });

  it('maps resolved shell skin tokens to CSS variables and classes', () => {
    expect(buildShellSkinClassName(GAME_WEB_CONFIG.ui.skin)).toContain(`shell-skin-${GAME_WEB_CONFIG.ui.skin.preset}`);
    expect(buildShellSkinStyle()).toMatchObject({
      '--shell-font-display': GAME_WEB_CONFIG.ui.skin.tokens.typography.displayFont,
      '--shell-radius-lg': GAME_WEB_CONFIG.ui.skin.tokens.shape.radiusLg,
      '--shell-shadow-surface': GAME_WEB_CONFIG.ui.skin.tokens.effects.surfaceShadow,
      '--shell-icon-create-room': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.createRoom),
      '--shell-icon-join-room': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.joinRoom),
      '--shell-icon-drawer': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.drawer),
      '--shell-icon-connected': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.connected),
      '--shell-icon-disconnected': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.disconnected),
      '--shell-icon-reconnecting': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.reconnecting),
      '--shell-icon-close': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.close),
      '--shell-icon-correct-guess': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.correctGuess),
      '--shell-icon-send-message': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.sendMessage),
      '--shell-icon-reference-placeholder': JSON.stringify(GAME_WEB_CONFIG.ui.skin.tokens.icons.referencePlaceholder),
    });
  });

  it('provides theme variables to its children', () => {
    render(
      <ShellThemeProvider>
        <span>Theme child</span>
      </ShellThemeProvider>,
    );

    const provider = screen.getByText('Theme child').parentElement!;
    expect(provider).toHaveClass('shell-theme-provider');
    expect(provider).toHaveClass('shell-skin-provider');
    expect(provider.style.getPropertyValue('--shell-color-primary')).toBe(GAME_WEB_CONFIG.ui.theme.colors.primary);
  });
});
