import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { RoomSessionProvider } from './providers/RoomSessionProvider';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from './game';
import './styles.css';

export { App } from './App';
export type { AppProps } from './App';
export type { LobbySettingsPanelSlotProps, LobbySettingsSlotProps, PromptReferenceSlotProps, SketchersonWebSlots } from './components/WebExtensionSlots';

export function applySketchersonDocumentMetadata(documentRef: Document = document): void {
  documentRef.title = GAME_DEFINITION.title;

  const iconHref = GAME_WEB_CONFIG.iconHref;
  if (!iconHref) {
    return;
  }

  let iconLink = documentRef.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!iconLink) {
    iconLink = documentRef.createElement('link');
    iconLink.rel = 'icon';
    documentRef.head.appendChild(iconLink);
  }
  iconLink.href = iconHref;
}

export function SketchersonWebApp({ slots }: { slots?: import('./components/WebExtensionSlots').SketchersonWebSlots } = {}) {
  applySketchersonDocumentMetadata();

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <RoomSessionProvider>
          <App slots={slots} />
        </RoomSessionProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
