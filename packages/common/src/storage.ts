import type { GameDefinition } from './gameDefinition';

export function buildGameStorageKey(gameDefinition: GameDefinition, key: string, separator = '.'): string {
  return `${gameDefinition.storageNamespace}${separator}${key}`;
}

export function buildGameCookieName(gameDefinition: GameDefinition, name: string): string {
  return `${gameDefinition.storageNamespace}-${name}`;
}
