import { resolveDrawingGameRules, type ResolvedDrawingGameRules } from './drawingGameRules';
import type { GameDefinition } from './gameDefinition';
import { createPromptEngine } from './promptEngine';
import type { FirstCorrectGuessTimeCapPreset, LobbySettings, RoundTimerPreset } from './room';

export function normalizeLobbySettingsForGame(gameDefinition: GameDefinition, settings: LobbySettings, rules: ResolvedDrawingGameRules = resolveDrawingGameRules()): LobbySettings {
  const defaultEnabledCollectionIds = createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds();

  return Object.assign({}, {
    roundTimerSeconds: rules.settings.roundTimerSeconds.default,
    firstCorrectGuessTimeCapSeconds: rules.settings.firstCorrectGuessTimeCapSeconds.default,
    guessingDelaySeconds: rules.settings.guessingDelaySeconds.default,
    turnsPerPlayer: rules.settings.turnsPerPlayer.default,
  }, settings, {
    enabledCollectionIds:
      settings.enabledCollectionIds === undefined
        ? defaultEnabledCollectionIds
        : createPromptEngine({ definition: gameDefinition }).normalizeCollectionIds(settings.enabledCollectionIds),
  });
}

export function areLobbySettingsValidForGame(gameDefinition: GameDefinition, settings: LobbySettings, rules: ResolvedDrawingGameRules = resolveDrawingGameRules()): boolean {
  const normalizedSettings = normalizeLobbySettingsForGame(gameDefinition, settings, rules);

  return (
    rules.settings.roundTimerSeconds.options.includes(normalizedSettings.roundTimerSeconds) &&
    rules.settings.firstCorrectGuessTimeCapSeconds.options.includes(normalizedSettings.firstCorrectGuessTimeCapSeconds) &&
    rules.settings.guessingDelaySeconds.options.includes(normalizedSettings.guessingDelaySeconds ?? 0) &&
    normalizedSettings.firstCorrectGuessTimeCapSeconds <= normalizedSettings.roundTimerSeconds &&
    rules.settings.turnsPerPlayer.options.includes(normalizedSettings.turnsPerPlayer) &&
    createPromptEngine({ definition: gameDefinition }).areCollectionIdsValid(settings.enabledCollectionIds ?? normalizedSettings.enabledCollectionIds)
  );
}

export function defaultLobbySettingsForGame(gameDefinition: GameDefinition, rules: ResolvedDrawingGameRules = resolveDrawingGameRules()): LobbySettings {
  return normalizeLobbySettingsForGame(gameDefinition, {
    roundTimerSeconds: rules.settings.roundTimerSeconds.default,
    firstCorrectGuessTimeCapSeconds: rules.settings.firstCorrectGuessTimeCapSeconds.default,
    guessingDelaySeconds: rules.settings.guessingDelaySeconds.default,
    turnsPerPlayer: rules.settings.turnsPerPlayer.default,
    artEnabled: true,
  }, rules);
}

export function getFirstCorrectGuessTimeCapPresets(roundTimerSeconds: RoundTimerPreset, rules: ResolvedDrawingGameRules = resolveDrawingGameRules()): FirstCorrectGuessTimeCapPreset[] {
  return rules.settings.firstCorrectGuessTimeCapSeconds.options.filter((preset) => preset <= roundTimerSeconds);
}
