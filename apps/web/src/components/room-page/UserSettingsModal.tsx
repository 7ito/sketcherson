import { type ChangeEvent, type RefObject } from 'react';
import { soundEffects } from '../../lib/soundEffects';
import { useUserSettings } from '../../lib/userSettings';

export function SettingsModal({
  dialogRef,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}) {
  const [settings, updateSettings] = useUserSettings();

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const volume = Number(event.target.value);
    updateSettings({ volume });
    soundEffects.setVolume(volume / 100);
  };

  const handleProfanityToggle = () => {
    updateSettings({ profanityFilterEnabled: !settings.profanityFilterEnabled });
  };

  return (
    <dialog ref={dialogRef} className="settings-dialog user-settings-dialog" onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}>
      <div className="settings-dialog-header">
        <h2>Settings</h2>
        <button type="button" className="settings-dialog-close" onClick={onClose}>&times;</button>
      </div>
      <div className="settings-dialog-body">
        <div className="user-setting-row">
          <label className="user-setting-label" htmlFor="volume-slider">Volume</label>
          <div className="user-setting-control volume-control">
            <input
              id="volume-slider"
              type="range"
              min={0}
              max={100}
              value={settings.volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
            <span className="volume-value">{settings.volume}%</span>
          </div>
        </div>
        <div className="user-setting-row">
          <label className="user-setting-label" htmlFor="profanity-toggle">Profanity filter</label>
          <div className="user-setting-control">
            <button
              id="profanity-toggle"
              type="button"
              role="switch"
              aria-checked={settings.profanityFilterEnabled}
              className="toggle-switch"
              onClick={handleProfanityToggle}
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
