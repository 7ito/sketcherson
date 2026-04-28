import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { RoomSessionProvider } from './providers/RoomSessionProvider';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from './game';
import './styles.css';

document.title = GAME_DEFINITION.title;

const iconHref = GAME_WEB_CONFIG.iconHref;
if (iconHref) {
  let iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }
  iconLink.href = iconHref;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <RoomSessionProvider>
          <App />
        </RoomSessionProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
