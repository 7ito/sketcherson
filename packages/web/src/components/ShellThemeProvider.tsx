import type { CSSProperties, ReactNode } from 'react';
import type { ResolvedShellSkinConfig, ResolvedShellUiConfig } from '@sketcherson/common/game';
import { GAME_WEB_CONFIG } from '../game';

type ShellThemeStyle = CSSProperties & Record<`--shell-${string}`, string>;

export function buildShellSkinClassName(skin: ResolvedShellSkinConfig = GAME_WEB_CONFIG.ui.skin): string {
  return ['shell-theme-provider', 'shell-skin-provider', `shell-skin-${skin.preset}`, skin.className].filter(Boolean).join(' ');
}

export function buildShellThemeStyle(
  colors: ResolvedShellUiConfig['theme']['colors'] = GAME_WEB_CONFIG.ui.theme.colors,
): ShellThemeStyle {
  return buildShellSkinStyle({ ...GAME_WEB_CONFIG.ui.skin, tokens: { ...GAME_WEB_CONFIG.ui.skin.tokens, colors } });
}

export function buildShellSkinStyle(skin: ResolvedShellSkinConfig = GAME_WEB_CONFIG.ui.skin): ShellThemeStyle {
  const { colors, typography, shape, effects, icons } = skin.tokens;

  return {
    '--shell-color-primary': colors.primary,
    '--shell-color-primary-strong': colors.primaryStrong,
    '--shell-color-primary-text': colors.primaryText,
    '--shell-color-accent': colors.accent,
    '--shell-color-accent-strong': colors.accentStrong,
    '--shell-color-accent-text': colors.accentText,
    '--shell-color-background': colors.background,
    '--shell-color-surface': colors.surface,
    '--shell-color-surface-strong': colors.surfaceStrong,
    '--shell-color-border': colors.border,
    '--shell-color-text': colors.text,
    '--shell-color-muted-text': colors.mutedText,
    '--shell-color-success': colors.success,
    '--shell-color-warning': colors.warning,
    '--shell-color-danger': colors.danger,
    '--shell-font-display': typography.displayFont,
    '--shell-font-body': typography.bodyFont,
    '--shell-font-mono': typography.monoFont,
    '--shell-radius-sm': shape.radiusSm,
    '--shell-radius-md': shape.radiusMd,
    '--shell-radius-lg': shape.radiusLg,
    '--shell-radius-pill': shape.radiusPill,
    '--shell-shadow-surface': effects.surfaceShadow,
    '--shell-shadow-button': effects.buttonShadow,
    '--shell-focus-ring': effects.focusRing,
    '--shell-icon-create-room': JSON.stringify(icons.createRoom),
    '--shell-icon-join-room': JSON.stringify(icons.joinRoom),
    '--shell-icon-drawer': JSON.stringify(icons.drawer),
    '--shell-icon-connected': JSON.stringify(icons.connected),
    '--shell-icon-disconnected': JSON.stringify(icons.disconnected),
    '--shell-icon-reconnecting': JSON.stringify(icons.reconnecting),
    '--shell-icon-close': JSON.stringify(icons.close),
    '--shell-icon-correct-guess': JSON.stringify(icons.correctGuess),
    '--shell-icon-send-message': JSON.stringify(icons.sendMessage),
    '--shell-icon-reference-placeholder': JSON.stringify(icons.referencePlaceholder),
    '--shell-icon-copy-link': JSON.stringify(icons.copyLink),
  };
}

function ShellSkinStylesheet({ href }: { href: string }) {
  return <link rel="stylesheet" href={href} data-shell-skin-stylesheet="" />;
}

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const skin = GAME_WEB_CONFIG.ui.skin;

  return (
    <div className={buildShellSkinClassName(skin)} style={buildShellSkinStyle(skin)}>
      {skin.cssHref ? <ShellSkinStylesheet href={skin.cssHref} /> : null}
      {children}
    </div>
  );
}

export const ShellSkinProvider = ShellThemeProvider;
