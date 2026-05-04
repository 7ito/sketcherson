import { createContext, type ReactNode, useContext } from 'react';
import type { LobbySettings, RoomState } from '@7ito/sketcherson-common/room';

export type PromptReferenceSlotProps = {
  room: RoomState;
  currentPlayerId: string;
  visibility: 'drawer' | 'reveal';
};

export type LobbySettingsSlotProps = {
  room: RoomState;
  currentPlayerId: string;
  isViewerHost: boolean;
  canEditSettings: boolean;
  settings: LobbySettings;
  disabled: boolean;
  isSavingSettings: boolean;
  settingsError: string;
  onChange: (settings: LobbySettings) => Promise<void>;
  defaultPanel: ReactNode;
};

export type LobbySettingsPanelSlotProps = LobbySettingsSlotProps;

export type SketchersonWebSlots = {
  homePageAddon?: () => ReactNode;
  promptReferencePanel?: (props: PromptReferenceSlotProps) => ReactNode;
  lobbySettingsPanel?: (props: LobbySettingsSlotProps) => ReactNode;
};

const EMPTY_SLOTS: SketchersonWebSlots = {};

const WebExtensionSlotsContext = createContext<SketchersonWebSlots>(EMPTY_SLOTS);

export function WebExtensionSlotsProvider({ slots, children }: { slots?: SketchersonWebSlots; children: ReactNode }) {
  return <WebExtensionSlotsContext.Provider value={slots ?? EMPTY_SLOTS}>{children}</WebExtensionSlotsContext.Provider>;
}

export function useWebExtensionSlots(): SketchersonWebSlots {
  return useContext(WebExtensionSlotsContext);
}
