import type { RoomState } from '@7ito/sketcherson-common/room';
import { useEffect, useRef } from 'react';
import { soundEffects, type GameSoundEffect } from './soundEffects';

function getTurnNumber(room: RoomState | null): number | null {
  return room?.match?.currentTurn?.turnNumber ?? null;
}

function getNewCorrectGuessPlayerIds(previousRoom: RoomState, nextRoom: RoomState): string[] {
  const previousTurn = previousRoom.match?.currentTurn;
  const nextTurn = nextRoom.match?.currentTurn;

  if (!previousTurn || !nextTurn || previousTurn.turnNumber !== nextTurn.turnNumber) {
    return [];
  }

  const previousCorrectPlayerIdSet = new Set(previousTurn.correctGuessPlayerIds);
  return nextTurn.correctGuessPlayerIds.filter((playerId) => !previousCorrectPlayerIdSet.has(playerId));
}

function hasPlayerJustGuessedCorrectly(
  previousRoom: RoomState,
  nextRoom: RoomState,
  currentPlayerId: string | null,
): boolean {
  if (!currentPlayerId) {
    return false;
  }

  return getNewCorrectGuessPlayerIds(previousRoom, nextRoom).includes(currentPlayerId);
}

function hasOtherPlayerJustGuessedCorrectly(
  previousRoom: RoomState,
  nextRoom: RoomState,
  currentPlayerId: string | null,
): boolean {
  const newCorrectGuessPlayerIds = getNewCorrectGuessPlayerIds(previousRoom, nextRoom);

  return newCorrectGuessPlayerIds.some((playerId) => playerId !== currentPlayerId);
}

function hasLobbyJoinCue(previousRoom: RoomState, nextRoom: RoomState): boolean {
  if (previousRoom.status !== 'lobby' || nextRoom.status !== 'lobby') {
    return false;
  }

  const previousPlayerIds = new Set(previousRoom.players.map((player) => player.id));
  return nextRoom.players.some((player) => !previousPlayerIds.has(player.id));
}

function hasTurnStartCue(previousRoom: RoomState, nextRoom: RoomState): boolean {
  const previousTurnNumber = getTurnNumber(previousRoom);
  const nextTurnNumber = getTurnNumber(nextRoom);

  return nextTurnNumber !== null && previousTurnNumber !== nextTurnNumber;
}

export function detectRoomAudioCues(
  previousRoom: RoomState | null,
  nextRoom: RoomState | null,
  currentPlayerId: string | null,
): GameSoundEffect[] {
  if (!previousRoom || !nextRoom || previousRoom.code !== nextRoom.code) {
    return [];
  }

  const cues: GameSoundEffect[] = [];

  if (hasLobbyJoinCue(previousRoom, nextRoom)) {
    cues.push('lobbyJoin');
  }

  if (hasTurnStartCue(previousRoom, nextRoom)) {
    cues.push('turnStart');
  }

  if (hasPlayerJustGuessedCorrectly(previousRoom, nextRoom, currentPlayerId)) {
    cues.push('correctGuess');
  }

  if (hasOtherPlayerJustGuessedCorrectly(previousRoom, nextRoom, currentPlayerId)) {
    cues.push('otherPlayerCorrectGuess');
  }

  return cues;
}

export function useRoomAudio(room: RoomState | null, currentPlayerId: string | null): void {
  const previousRoomRef = useRef<RoomState | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const unlockAudio = () => {
      void soundEffects.unlock();
    };

    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    const previousRoom = previousRoomRef.current;
    const cues = detectRoomAudioCues(previousRoom, room, currentPlayerId);

    previousRoomRef.current = room;

    for (const cue of cues) {
      void soundEffects.play(cue);
    }
  }, [currentPlayerId, room]);
}
