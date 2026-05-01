import { normalizeLobbySettingsForGame } from '@sketcherson/common/settings';
import type { LobbySettings } from '@sketcherson/common/room';
import { GAME_DEFINITION, GAME_RUNTIME, GAME_WEB_CONFIG } from '../../game';
import {
  capitalizeFirst,
  clampFirstCorrectGuessTimeCapSeconds,
  GAME_TERMINOLOGY,
  getEnabledCollectionNames,
  PROMPT_COLLECTIONS,
  updateEnabledCollectionSettings,
} from './helpers';

const SHELL_SETTINGS_COPY = GAME_WEB_CONFIG.ui.copy.settings;
const GAME_SETTINGS_RULES = GAME_RUNTIME.rules.settings;
const getFirstCorrectGuessTimeCapOptions = (roundTimerSeconds: LobbySettings['roundTimerSeconds']) =>
  Array.from(new Set([...GAME_SETTINGS_RULES.firstCorrectGuessTimeCapSeconds.options, roundTimerSeconds]))
    .filter((preset) => preset <= roundTimerSeconds)
    .sort((left, right) => left - right);

const formatFirstCorrectGuessTimeCapOption = (
  preset: LobbySettings['firstCorrectGuessTimeCapSeconds'],
  roundTimerSeconds: LobbySettings['roundTimerSeconds'],
  unit: 's' | 'seconds',
) => `${preset}${unit === 's' ? 's' : ' seconds'}${preset === roundTimerSeconds ? ' (none)' : ''}`;

function updateRoundTimerSettings(
  settings: LobbySettings,
  roundTimerSeconds: LobbySettings['roundTimerSeconds'],
): LobbySettings {
  return {
    ...settings,
    roundTimerSeconds,
    firstCorrectGuessTimeCapSeconds: clampFirstCorrectGuessTimeCapSeconds(
      roundTimerSeconds,
      settings.firstCorrectGuessTimeCapSeconds,
    ),
  };
}

export function CollectionSettingsField({
  settings,
  disabled,
  variant,
  onChange,
}: {
  settings: LobbySettings;
  disabled?: boolean;
  variant: 'lobby' | 'postgame';
  onChange: (settings: LobbySettings) => void;
}) {
  const normalizedSettings = normalizeLobbySettingsForGame(GAME_DEFINITION, settings);
  const enabledCollectionIds = normalizedSettings.enabledCollectionIds ?? [];
  const hasSingleCollectionEnabled = enabledCollectionIds.length <= 1;

  return (
    <fieldset className={variant === 'lobby' ? 'lobby-collection-group' : 'collection-group'} disabled={disabled}>
      <legend>{variant === 'lobby' ? capitalizeFirst(GAME_TERMINOLOGY.collectionPlural) : `Enabled ${GAME_TERMINOLOGY.collectionPlural}`}</legend>
      <div className={variant === 'lobby' ? 'lobby-collection-list' : 'collection-list'}>
        {PROMPT_COLLECTIONS.map((collection) => {
          const checked = enabledCollectionIds.includes(collection.id);

          return (
            <label key={collection.id} className={variant === 'lobby' ? 'lobby-collection-option' : 'collection-option'}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || (checked && hasSingleCollectionEnabled)}
                onChange={(event) => onChange(updateEnabledCollectionSettings(normalizedSettings, collection.id, event.target.checked))}
              />
              <span>
                <strong>{collection.name}</strong>
                {collection.description ? <small>{collection.description}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SharedSettingsFields({
  variant,
  settings,
  disabled,
  onChange,
}: {
  variant: 'lobby' | 'postgame';
  settings: LobbySettings;
  disabled?: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  if (variant === 'lobby') {
    return (
      <>
        <div className="lobby-settings-row">
          <label className="lobby-setting">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.roundTimerLabel}</span>
            <select
              value={settings.roundTimerSeconds}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateRoundTimerSettings(settings, Number(event.target.value) as LobbySettings['roundTimerSeconds']))
              }
            >
              {GAME_SETTINGS_RULES.roundTimerSeconds.options.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}s
                </option>
              ))}
            </select>
          </label>

          <label className="lobby-setting">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.firstCorrectGuessTimeCapLabel}</span>
            <select
              value={settings.firstCorrectGuessTimeCapSeconds}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...settings,
                  firstCorrectGuessTimeCapSeconds: Number(event.target.value) as LobbySettings['firstCorrectGuessTimeCapSeconds'],
                })
              }
            >
              {getFirstCorrectGuessTimeCapOptions(settings.roundTimerSeconds).map((preset) => (
                <option key={preset} value={preset}>
                  {formatFirstCorrectGuessTimeCapOption(preset, settings.roundTimerSeconds, 's')}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="lobby-settings-row">
          <label className="lobby-setting">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.guessingDelayLabel}</span>
            <select
              value={settings.guessingDelaySeconds ?? 0}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...settings,
                  guessingDelaySeconds: Number(event.target.value) as NonNullable<LobbySettings['guessingDelaySeconds']>,
                })
              }
            >
              {GAME_SETTINGS_RULES.guessingDelaySeconds.options.map((preset) => (
                <option key={preset} value={preset}>
                  {preset === 0 ? 'Off' : `${preset}s`}
                </option>
              ))}
            </select>
          </label>

          <label className="lobby-setting">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.turnsPerPlayerLabel}</span>
            <select
              value={settings.turnsPerPlayer}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...settings,
                  turnsPerPlayer: Number(event.target.value) as LobbySettings['turnsPerPlayer'],
                })
              }
            >
              {GAME_SETTINGS_RULES.turnsPerPlayer.options.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
        </div>

        {GAME_RUNTIME.rules.features.closeGuessFeedback ? (
          <div className="lobby-settings-row">
            <label className="lobby-toggle-row">
              <input
                type="checkbox"
                checked={settings.hideCloseGuesses ?? false}
                disabled={disabled}
                onChange={(event) => onChange({ ...settings, hideCloseGuesses: event.target.checked })}
              />
              <span>Hide close guesses from other players</span>
            </label>

            <label className="lobby-toggle-row">
              <input
                type="checkbox"
                checked={settings.showCloseGuessAlerts ?? true}
                disabled={disabled}
                onChange={(event) => onChange({ ...settings, showCloseGuessAlerts: event.target.checked })}
              />
              <span>Show close guess alerts</span>
            </label>
          </div>
        ) : null}

        <label className="lobby-toggle-row">
          <input
            type="checkbox"
            checked={settings.artEnabled}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...settings,
                artEnabled: event.target.checked,
              })
            }
          />
          <span>{capitalizeFirst(SHELL_SETTINGS_COPY.referenceArtToggleLabel)}</span>
        </label>

        <CollectionSettingsField variant="lobby" settings={settings} disabled={disabled} onChange={onChange} />
      </>
    );
  }

  return (
    <>
      <label>
        <span>{SHELL_SETTINGS_COPY.roundTimerLabel}</span>
        <select
          value={settings.roundTimerSeconds}
          disabled={disabled}
          onChange={(event) =>
            onChange(updateRoundTimerSettings(settings, Number(event.target.value) as LobbySettings['roundTimerSeconds']))
          }
        >
          {GAME_SETTINGS_RULES.roundTimerSeconds.options.map((preset) => (
            <option key={preset} value={preset}>
              {preset} seconds
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{SHELL_SETTINGS_COPY.firstCorrectGuessTimeCapLabel}</span>
        <select
          value={settings.firstCorrectGuessTimeCapSeconds}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              firstCorrectGuessTimeCapSeconds: Number(event.target.value) as LobbySettings['firstCorrectGuessTimeCapSeconds'],
            })
          }
        >
          {getFirstCorrectGuessTimeCapOptions(settings.roundTimerSeconds).map((preset) => (
            <option key={preset} value={preset}>
              {formatFirstCorrectGuessTimeCapOption(preset, settings.roundTimerSeconds, 'seconds')}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{SHELL_SETTINGS_COPY.guessingDelayLabel}</span>
        <select
          value={settings.guessingDelaySeconds ?? 0}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              guessingDelaySeconds: Number(event.target.value) as NonNullable<LobbySettings['guessingDelaySeconds']>,
            })
          }
        >
          {GAME_SETTINGS_RULES.guessingDelaySeconds.options.map((preset) => (
            <option key={preset} value={preset}>
              {preset === 0 ? 'Off' : `${preset} seconds`}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{SHELL_SETTINGS_COPY.turnsPerPlayerLabel}</span>
        <select
          value={settings.turnsPerPlayer}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              turnsPerPlayer: Number(event.target.value) as LobbySettings['turnsPerPlayer'],
            })
          }
        >
          {GAME_SETTINGS_RULES.turnsPerPlayer.options.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.artEnabled}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              artEnabled: event.target.checked,
            })
          }
        />
        <span>Enable {SHELL_SETTINGS_COPY.referenceArtToggleLabel} for the active drawer and answer reveal</span>
      </label>

      <CollectionSettingsField variant="postgame" settings={settings} disabled={disabled} onChange={onChange} />
    </>
  );
}

export function SettingsSummary({
  variant,
  settings,
  helperText,
}: {
  variant: 'lobby' | 'postgame';
  settings: LobbySettings;
  helperText: string;
}) {
  if (variant === 'lobby') {
    return (
      <div className="lobby-settings-readonly">
        <div className="lobby-settings-row">
          <div className="lobby-setting-display">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.roundTimerLabel}</span>
            <span className="lobby-setting-value">{settings.roundTimerSeconds}s</span>
          </div>
          <div className="lobby-setting-display">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.firstCorrectGuessTimeCapLabel}</span>
            <span className="lobby-setting-value">
              {formatFirstCorrectGuessTimeCapOption(settings.firstCorrectGuessTimeCapSeconds, settings.roundTimerSeconds, 's')}
            </span>
          </div>
        </div>
        <div className="lobby-settings-row">
          <div className="lobby-setting-display">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.guessingDelayLabel}</span>
            <span className="lobby-setting-value">{settings.guessingDelaySeconds ?? 0}s</span>
          </div>
          <div className="lobby-setting-display">
            <span className="lobby-setting-label">{SHELL_SETTINGS_COPY.turnsPerPlayerLabel}</span>
            <span className="lobby-setting-value">{settings.turnsPerPlayer}</span>
          </div>
        </div>
        <div className="lobby-setting-display">
          <span className="lobby-setting-label">{capitalizeFirst(SHELL_SETTINGS_COPY.referenceArtToggleLabel)}</span>
          <span className="lobby-setting-value">{settings.artEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="lobby-setting-display">
          <span className="lobby-setting-label">{capitalizeFirst(GAME_TERMINOLOGY.collectionPlural)}</span>
          <span className="lobby-setting-value">{getEnabledCollectionNames(settings)}</span>
        </div>
        <p className="helper-text" style={{ textAlign: 'center', marginTop: '0.25rem' }}>{helperText}</p>
      </div>
    );
  }

  return (
    <div className="settings-summary">
      <p className="helper-text">{helperText}</p>
      <dl className="settings-list">
        <div>
          <dt>{SHELL_SETTINGS_COPY.roundTimerLabel}</dt>
          <dd>{settings.roundTimerSeconds} seconds</dd>
        </div>
        <div>
          <dt>{SHELL_SETTINGS_COPY.firstCorrectGuessTimeCapLabel}</dt>
          <dd>{formatFirstCorrectGuessTimeCapOption(settings.firstCorrectGuessTimeCapSeconds, settings.roundTimerSeconds, 'seconds')}</dd>
        </div>
        <div>
          <dt>{SHELL_SETTINGS_COPY.guessingDelayLabel}</dt>
          <dd>{settings.guessingDelaySeconds ?? 0} seconds</dd>
        </div>
        <div>
          <dt>{SHELL_SETTINGS_COPY.turnsPerPlayerLabel}</dt>
          <dd>{settings.turnsPerPlayer}</dd>
        </div>
        <div>
          <dt>{capitalizeFirst(SHELL_SETTINGS_COPY.referenceArtToggleLabel)}</dt>
          <dd>{settings.artEnabled ? 'Enabled' : 'Disabled'}</dd>
        </div>
        <div>
          <dt>{capitalizeFirst(GAME_TERMINOLOGY.collectionPlural)}</dt>
          <dd>{getEnabledCollectionNames(settings)}</dd>
        </div>
      </dl>
    </div>
  );
}
