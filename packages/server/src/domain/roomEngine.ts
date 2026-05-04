import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, ResumeRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction } from '@7ito/sketcherson-common/drawing';
import { InMemoryRoomLifecycleMachine, type InMemoryRoomLifecycleMachineOptions } from './roomRuntime/InMemoryRoomLifecycleMachine';
import type { RoomLifecycleMachine } from './roomRuntime/RoomLifecycleMachine';
import type { RoomTimerFiredInput } from './roomRuntime/timers';
import type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult } from './roomRuntime/transport';

export type RoomEngineOptions = InMemoryRoomLifecycleMachineOptions;
export type InMemoryRoomEngineOptions = InMemoryRoomLifecycleMachineOptions;
export type { InMemoryRoomLifecycleMachineOptions };
export type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult } from './roomRuntime/transport';
export type { RoomTimerFiredInput } from './roomRuntime/timers';

export interface RoomEngine {
  onRoomChanged(listener: (roomCode: string) => void): void;
  destroy(): void;

  createRoom(input: ConnectionInput & { nickname: string }): ApiResult<CreateRoomSuccess>;
  joinRoom(input: ConnectionInput & { code: string; nickname: string }): ApiResult<JoinRoomSuccess>;
  reclaimRoom(input: ConnectionInput & { code: string; sessionToken: string }): ApiResult<ReclaimRoomSuccess>;

  updateLobbySettings(input: ActorInput<{ settings: LobbySettings }>): ApiResult<UpdateLobbySettingsSuccess>;
  startRoom(input: EmptyActorInput): ApiResult<StartRoomSuccess>;
  pauseRoom(input: EmptyActorInput): ApiResult<PauseRoomSuccess>;
  resumeRoom(input: EmptyActorInput): ApiResult<ResumeRoomSuccess>;
  kickPlayer(input: ActorInput<{ playerId: string }>): KickPlayerResult;
  rerollTurn(input: EmptyActorInput): ApiResult<RerollTurnSuccess>;
  submitMessage(input: ActorInput<{ text: string }>): ApiResult<SubmitMessageSuccess>;

  applyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<DrawingActionSuccess>;
  applyLobbyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<LobbyDrawingActionSuccess>;

  getRoomState(input: { code: string; origin: string; viewerConnectionId?: string }): ApiResult<RoomStateSuccess>;
  getBroadcastTargets(input: { code: string; origin: string }): BroadcastTarget[];
  disconnect(input: { connectionId: string }): string | null;
  timerFired(input: RoomTimerFiredInput): void;
  hasRoom(code: string): boolean;
}

export function createInMemoryRoomEngine(options: InMemoryRoomLifecycleMachineOptions): RoomEngine {
  return new InMemoryRoomLifecycleMachine(options);
}

export function createRoomLifecycleMachine(options: InMemoryRoomLifecycleMachineOptions): RoomLifecycleMachine {
  return new InMemoryRoomLifecycleMachine(options);
}
