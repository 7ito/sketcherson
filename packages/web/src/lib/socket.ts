import { io } from 'socket.io-client';

declare global {
  interface Window {
    SKETCHERSON_SERVER_URL?: string;
  }
}

function getServerUrl(): string {
  const configuredUrl = typeof window === 'undefined' ? undefined : window.SKETCHERSON_SERVER_URL;
  const defaultUrl = typeof window === 'undefined' ? '' : window.location.origin;

  return stripTrailingSlash(configuredUrl ?? defaultUrl);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const serverUrl = getServerUrl();

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ['websocket'],
});

export const drawingSocket = io(`${serverUrl}/drawing`, {
  autoConnect: true,
  transports: ['websocket'],
  multiplex: false,
});
