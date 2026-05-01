export type RoomPhaseTimerKind = 'countdownEnded' | 'roundEnded' | 'revealEnded' | 'pauseExpired' | 'resumeCountdownEnded';

export type RoomTimerFiredInput =
  | { type: 'phase'; roomCode: string; kind: RoomPhaseTimerKind }
  | { type: 'reconnect'; roomCode: string; playerId: string };
