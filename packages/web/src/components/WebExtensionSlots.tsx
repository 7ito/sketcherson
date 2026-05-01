import { createContext, type ReactNode, useContext } from 'react';
import type { RoomState } from '@sketcherson/common/room';

export type PromptReferenceSlotProps = {
  room: RoomState;
  currentPlayerId: string;
  visibility: 'drawer' | 'reveal';
};

export type SketchersonWebSlots = {
  homePageAddon?: () => ReactNode;
  promptReferencePanel?: (props: PromptReferenceSlotProps) => ReactNode;
};

const EMPTY_SLOTS: SketchersonWebSlots = {};

const WebExtensionSlotsContext = createContext<SketchersonWebSlots>(EMPTY_SLOTS);

export function WebExtensionSlotsProvider({ slots, children }: { slots?: SketchersonWebSlots; children: ReactNode }) {
  return <WebExtensionSlotsContext.Provider value={slots ?? EMPTY_SLOTS}>{children}</WebExtensionSlotsContext.Provider>;
}

export function useWebExtensionSlots(): SketchersonWebSlots {
  return useContext(WebExtensionSlotsContext);
}
