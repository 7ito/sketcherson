import type { PromptCollection } from '@7ito/sketcherson-common/prompts';
import { normalizeLobbySettingsForGame } from '@7ito/sketcherson-common/settings';
import type { CurrentTurnState, FirstCorrectGuessTimeCapPreset, LobbySettings, RoomPlayer, RoomState, RoundTimerPreset } from '@7ito/sketcherson-common/room';
import { useEffect, useRef, useState } from 'react';
import { GAME_DEFINITION, GAME_RUNTIME, GAME_WEB_CONFIG } from '../../game';

export const GAME_TERMINOLOGY = GAME_DEFINITION.terminology;
export const PROMPT_COLLECTIONS: readonly PromptCollection[] = GAME_DEFINITION.promptCatalog.collections;

export function capitalizeFirst(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

export function getRoomServerReferenceArtEnabled(room: RoomState): boolean {
  return room.serverReferenceArtEnabled ?? true;
}

export function getCurrentTurnReferenceArtUrl(currentTurn: CurrentTurnState): string | null {
  return currentTurn.referenceArtUrl ?? null;
}

export function usePhaseCountdown(phaseEndsAt: number | null): number | null {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => getSecondsRemaining(phaseEndsAt));

  useEffect(() => {
    setSecondsRemaining(getSecondsRemaining(phaseEndsAt));

    if (!phaseEndsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setSecondsRemaining(getSecondsRemaining(phaseEndsAt));
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [phaseEndsAt]);

  return secondsRemaining;
}

export function isNearBottom(container: HTMLDivElement): boolean {
  return container.scrollHeight - container.clientHeight - container.scrollTop <= 48;
}

export function useAutoScrollToBottom(changeKey: string | number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = () => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    shouldAutoScrollRef.current = isNearBottom(container);
  };

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    shouldAutoScrollRef.current = isNearBottom(container);
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !shouldAutoScrollRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      shouldAutoScrollRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [changeKey]);

  return {
    containerRef,
    handleScroll,
  };
}

export function getSecondsRemaining(phaseEndsAt: number | null): number | null {
  if (!phaseEndsAt) {
    return null;
  }

  return Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
}

export function PlayerConnectionBadge({ player, roomStatus }: { player: RoomPlayer; roomStatus: RoomState['status'] }) {
  const reconnectSeconds = usePhaseCountdown(player.reconnectBy);
  const frozenReconnectSeconds = player.reconnectRemainingMs ? Math.ceil(player.reconnectRemainingMs / 1000) : null;

  if (player.connected) {
    return <span className="badge subdued">Connected</span>;
  }

  return <span className="badge warning">Reconnecting {roomStatus === 'paused' ? frozenReconnectSeconds ?? 0 : reconnectSeconds ?? 0}s</span>;
}

export function canHostKickPlayer(player: RoomPlayer, currentPlayerId: string): boolean {
  return !player.isHost && player.id !== currentPlayerId;
}

export function clampFirstCorrectGuessTimeCapSeconds(
  roundTimerSeconds: RoundTimerPreset,
  firstCorrectGuessTimeCapSeconds: FirstCorrectGuessTimeCapPreset,
): FirstCorrectGuessTimeCapPreset {
  const availableCaps = Array.from(new Set([...GAME_RUNTIME.rules.settings.firstCorrectGuessTimeCapSeconds.options, roundTimerSeconds]))
    .filter((preset) => preset <= roundTimerSeconds)
    .sort((left, right) => left - right);

  if (availableCaps.includes(firstCorrectGuessTimeCapSeconds)) {
    return firstCorrectGuessTimeCapSeconds;
  }

  return availableCaps[availableCaps.length - 1] ?? 15;
}

export function updateEnabledCollectionSettings(settings: LobbySettings, collectionId: string, enabled: boolean): LobbySettings {
  const normalizedSettings = normalizeLobbySettingsForGame(GAME_DEFINITION, settings);
  const nextCollectionIds = enabled
    ? [...normalizedSettings.enabledCollectionIds!, collectionId]
    : normalizedSettings.enabledCollectionIds!.filter((selectedCollectionId) => selectedCollectionId !== collectionId);

  return normalizeLobbySettingsForGame(GAME_DEFINITION, {
    ...normalizedSettings,
    enabledCollectionIds: nextCollectionIds,
  });
}

export function getEnabledCollectionNames(settings: LobbySettings): string {
  const enabledCollectionIdSet = new Set(normalizeLobbySettingsForGame(GAME_DEFINITION, settings).enabledCollectionIds);

  return (
    PROMPT_COLLECTIONS.filter((collection) => enabledCollectionIdSet.has(collection.id))
      .map((collection) => collection.name)
      .join(', ') || 'None'
  );
}

export function getShellPlayerAccentColors(): readonly string[] {
  return GAME_WEB_CONFIG.ui.skin.tokens.playerAccentColors;
}

export function buildPlayerAccentMap(players: RoomPlayer[], accentColors: readonly string[] = getShellPlayerAccentColors()): Map<string, string> {
  return new Map(players.map((player, index) => [player.id, accentColors[index % accentColors.length] ?? GAME_WEB_CONFIG.ui.theme.colors.mutedText]));
}

export function getPlayerAccentStyle(playerId: string | null | undefined, playerAccentColors: Map<string, string>) {
  const color = playerId ? playerAccentColors.get(playerId) : undefined;

  if (!color) {
    return undefined;
  }

  return { color };
}

