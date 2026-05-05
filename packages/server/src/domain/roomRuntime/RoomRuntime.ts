import type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult } from './transport';
import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, DrawingSnapshotSuccess, JoinRoomSuccess, KickPlayerSuccess, LobbyDrawingActionSuccess, LobbySettings, PauseRoomSuccess, ReclaimRoomSuccess, ResumeRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@7ito/sketcherson-common/room';
import type { DrawingAction, DrawingActionAppliedEvent } from '@7ito/sketcherson-common/drawing';
import { InMemoryRoomLifecycleMachine, type InMemoryRoomLifecycleMachineOptions } from './InMemoryRoomLifecycleMachine';
import type { RoomCommand, RoomCommandResult, RoomLifecycleMachine, RoomQuery, RoomQueryResult } from './RoomLifecycleMachine';

export type RoomRuntimeOptions = InMemoryRoomLifecycleMachineOptions;

export interface RoomCommandOutcome<T> {
  response: ApiResult<T>;
  effects: RoomRuntimeEffect[];
}

export type RoomRuntimeEffect =
  | { type: 'joinTransportRoom'; connectionId: string; roomCode: string }
  | { type: 'leaveTransportRoom'; connectionId: string; roomCode: string }
  | { type: 'emit'; connectionId: string; event: string; payload: unknown }
  | { type: 'broadcastRoomState'; roomCode: string; targets: BroadcastTarget[] }
  | { type: 'broadcastDrawingAction'; roomCode: string; event: DrawingActionAppliedEvent; target: 'match' | 'lobby' };

export type { ActorInput, BroadcastTarget, ConnectionInput, EmptyActorInput, KickPlayerResult };

/**
 * Stable, transport-neutral boundary over the in-memory room engine.
 *
 * Server adapters and tests should depend on this object-input API. The lifecycle machine owns room commands,
 * queries, timers, revision updates, and room-change notifications behind this boundary.
 */
export class RoomRuntime {
  private readonly machine: RoomLifecycleMachine;

  public constructor(options: RoomRuntimeOptions) {
    this.machine = new InMemoryRoomLifecycleMachine(options);
  }

  public onRoomChanged(listener: (roomCode: string) => void): void {
    this.machine.onChanged(listener);
  }

  public onRoomChangedEffect(origin: string, listener: (effect: RoomRuntimeEffect) => void): void {
    this.machine.onChanged((roomCode) => {
      listener(this.createBroadcastRoomStateEffect(roomCode, origin));
    });
  }

  public setRoomChangedListener(listener: (roomCode: string) => void): void {
    this.onRoomChanged(listener);
  }

  public destroy(): void {
    this.machine.destroy();
  }

  public deleteIdleRooms(idleMs: number): string[] {
    if (this.machine instanceof InMemoryRoomLifecycleMachine) {
      return this.machine.deleteIdleRooms(idleMs);
    }

    return [];
  }

  public createRoom(input: ConnectionInput & { nickname: string }): ApiResult<CreateRoomSuccess> {
    return this.dispatch<ApiResult<CreateRoomSuccess>>({ type: 'createRoom', ...input });
  }

  public createRoomOutcome(input: ConnectionInput & { nickname: string }): RoomCommandOutcome<CreateRoomSuccess> {
    const response = this.createRoom(input);
    const effects: RoomRuntimeEffect[] = response.ok
      ? [
          { type: 'joinTransportRoom', connectionId: input.connectionId, roomCode: response.data.room.code },
          this.createBroadcastRoomStateEffect(response.data.room.code, input.origin),
        ]
      : [];

    return { response, effects };
  }

  public joinRoom(input: ConnectionInput & { code: string; nickname: string }): ApiResult<JoinRoomSuccess> {
    return this.dispatch<ApiResult<JoinRoomSuccess>>({ type: 'joinRoom', ...input });
  }

  public joinRoomOutcome(input: ConnectionInput & { code: string; nickname: string }): RoomCommandOutcome<JoinRoomSuccess> {
    const response = this.joinRoom(input);
    const effects: RoomRuntimeEffect[] = response.ok
      ? [
          { type: 'joinTransportRoom', connectionId: input.connectionId, roomCode: response.data.room.code },
          this.createBroadcastRoomStateEffect(response.data.room.code, input.origin),
        ]
      : [];

    return { response, effects };
  }

  public reclaimRoom(input: ConnectionInput & { code: string; sessionToken: string }): ApiResult<ReclaimRoomSuccess> {
    return this.dispatch<ApiResult<ReclaimRoomSuccess>>({ type: 'reclaimRoom', ...input });
  }

  public reclaimRoomOutcome(input: ConnectionInput & { code: string; sessionToken: string }): RoomCommandOutcome<ReclaimRoomSuccess> {
    const response = this.reclaimRoom(input);
    const effects: RoomRuntimeEffect[] = response.ok
      ? [
          { type: 'joinTransportRoom', connectionId: input.connectionId, roomCode: response.data.room.code },
          this.createBroadcastRoomStateEffect(response.data.room.code, input.origin),
        ]
      : [];

    return { response, effects };
  }

  public updateLobbySettings(input: ActorInput<{ settings: LobbySettings }>): ApiResult<UpdateLobbySettingsSuccess> {
    return this.dispatch<ApiResult<UpdateLobbySettingsSuccess>>({ type: 'updateLobbySettings', ...input });
  }

  public updateLobbySettingsOutcome(input: ActorInput<{ settings: LobbySettings }>): RoomCommandOutcome<UpdateLobbySettingsSuccess> {
    return this.withRoomStateBroadcast(this.updateLobbySettings(input), input.origin);
  }

  public startRoom(input: EmptyActorInput): ApiResult<StartRoomSuccess> {
    return this.dispatch<ApiResult<StartRoomSuccess>>({ type: 'startRoom', ...input });
  }

  public startRoomOutcome(input: EmptyActorInput): RoomCommandOutcome<StartRoomSuccess> {
    return this.withRoomStateBroadcast(this.startRoom(input), input.origin);
  }

  public pauseRoom(input: EmptyActorInput): ApiResult<PauseRoomSuccess> {
    return this.dispatch<ApiResult<PauseRoomSuccess>>({ type: 'pauseRoom', ...input });
  }

  public pauseRoomOutcome(input: EmptyActorInput): RoomCommandOutcome<PauseRoomSuccess> {
    return this.withRoomStateBroadcast(this.pauseRoom(input), input.origin);
  }

  public resumeRoom(input: EmptyActorInput): ApiResult<ResumeRoomSuccess> {
    return this.dispatch<ApiResult<ResumeRoomSuccess>>({ type: 'resumeRoom', ...input });
  }

  public resumeRoomOutcome(input: EmptyActorInput): RoomCommandOutcome<ResumeRoomSuccess> {
    return this.withRoomStateBroadcast(this.resumeRoom(input), input.origin);
  }

  public kickPlayer(input: ActorInput<{ playerId: string }>): KickPlayerResult {
    return this.dispatch<KickPlayerResult>({ type: 'kickPlayer', ...input });
  }

  public kickPlayerOutcome(input: ActorInput<{ playerId: string }>): RoomCommandOutcome<KickPlayerSuccess> {
    const result = this.kickPlayer(input);
    const response: ApiResult<KickPlayerSuccess> = result.ok ? { ok: true, data: result.data } : result;
    const effects: RoomRuntimeEffect[] = result.ok
      ? [
          ...(result.kickedConnectionId
            ? [
                { type: 'leaveTransportRoom' as const, connectionId: result.kickedConnectionId, roomCode: result.data.room.code },
                {
                  type: 'emit' as const,
                  connectionId: result.kickedConnectionId,
                  event: 'room:kicked',
                  payload: {
                    roomCode: result.data.room.code,
                    message: 'You were removed from the room by the host.',
                  },
                },
              ]
            : []),
          this.createBroadcastRoomStateEffect(result.data.room.code, input.origin),
        ]
      : [];

    return { response, effects };
  }

  public rerollTurn(input: EmptyActorInput): ApiResult<RerollTurnSuccess> {
    return this.dispatch<ApiResult<RerollTurnSuccess>>({ type: 'rerollTurn', ...input });
  }

  public rerollTurnOutcome(input: EmptyActorInput): RoomCommandOutcome<RerollTurnSuccess> {
    return this.withRoomStateBroadcast(this.rerollTurn(input), input.origin);
  }

  public submitMessage(input: ActorInput<{ text: string }>): ApiResult<SubmitMessageSuccess> {
    return this.dispatch<ApiResult<SubmitMessageSuccess>>({ type: 'submitMessage', ...input });
  }

  public submitMessageOutcome(input: ActorInput<{ text: string }>): RoomCommandOutcome<SubmitMessageSuccess> {
    const response = this.submitMessage(input);
    return {
      response,
      effects: response.ok ? [this.createBroadcastRoomStateEffect(response.data.room.code, input.origin, { drawingPayload: 'omit' })] : [],
    };
  }

  public applyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<DrawingActionSuccess> {
    return this.dispatch<ApiResult<DrawingActionSuccess>>({ type: 'applyDrawingAction', ...input });
  }

  public applyDrawingActionOutcome(input: ActorInput<{ action: DrawingAction }>): RoomCommandOutcome<DrawingActionSuccess> {
    const response = this.applyDrawingAction(input);
    const effects: RoomRuntimeEffect[] = response.ok
      ? [{
          type: 'broadcastDrawingAction',
          roomCode: response.data.roomCode,
          target: 'match',
          event: {
            code: response.data.roomCode,
            action: input.payload.action,
            revision: response.data.revision,
            stateRevision: response.data.stateRevision,
          },
        }]
      : [];

    return { response, effects };
  }

  public applyLobbyDrawingAction(input: ActorInput<{ action: DrawingAction }>): ApiResult<LobbyDrawingActionSuccess> {
    return this.dispatch<ApiResult<LobbyDrawingActionSuccess>>({ type: 'applyLobbyDrawingAction', ...input });
  }

  public applyLobbyDrawingActionOutcome(input: ActorInput<{ action: DrawingAction }>): RoomCommandOutcome<LobbyDrawingActionSuccess> {
    const response = this.applyLobbyDrawingAction(input);
    const effects: RoomRuntimeEffect[] = response.ok
      ? [{
          type: 'broadcastDrawingAction',
          roomCode: response.data.roomCode,
          target: 'lobby',
          event: {
            code: response.data.roomCode,
            action: input.payload.action,
            revision: response.data.revision,
            stateRevision: response.data.stateRevision,
          },
        }]
      : [];

    return { response, effects };
  }

  public getRoomState(input: { code: string; origin: string; viewerConnectionId?: string }): ApiResult<RoomStateSuccess> {
    return this.query<ApiResult<RoomStateSuccess>>({ type: 'getRoomState', ...input });
  }

  public getDrawingSnapshot(input: { code: string; target: 'match' | 'lobby' }): ApiResult<DrawingSnapshotSuccess> {
    return this.query<ApiResult<DrawingSnapshotSuccess>>({ type: 'getDrawingSnapshot', ...input });
  }

  public getBroadcastTargets(input: { code: string; origin: string; drawingPayload?: 'include' | 'omit' }): BroadcastTarget[] {
    return this.query<BroadcastTarget[]>({ type: 'getBroadcastTargets', ...input });
  }

  public disconnect(input: { connectionId: string }): string | null {
    return this.dispatch<string | null>({ type: 'disconnect', ...input });
  }

  public disconnectOutcome(input: { connectionId: string; origin: string }): RoomCommandOutcome<string | null> {
    const roomCode = this.disconnect(input);
    const response = { ok: true as const, data: roomCode };
    const effects: RoomRuntimeEffect[] = roomCode ? [this.createBroadcastRoomStateEffect(roomCode, input.origin)] : [];

    return { response, effects };
  }

  public createRoomStateBroadcastEffect(roomCode: string, origin: string, options?: { exceptConnectionId?: string; drawingPayload?: 'include' | 'omit' }): RoomRuntimeEffect {
    const targets = this.getBroadcastTargets({ code: roomCode, origin, drawingPayload: options?.drawingPayload }).filter((target) => target.connectionId !== options?.exceptConnectionId);

    return {
      type: 'broadcastRoomState',
      roomCode,
      targets,
    };
  }

  public hasRoom(code: string): boolean {
    return this.query<boolean>({ type: 'hasRoom', code });
  }

  private dispatch<TResult extends RoomCommandResult>(command: RoomCommand): TResult {
    return this.machine.dispatch(command) as TResult;
  }

  private query<TResult extends RoomQueryResult>(query: RoomQuery): TResult {
    return this.machine.query(query) as TResult;
  }

  private withRoomStateBroadcast<T extends { room: { code: string } }>(response: ApiResult<T>, origin: string): RoomCommandOutcome<T> {
    return {
      response,
      effects: response.ok ? [this.createBroadcastRoomStateEffect(response.data.room.code, origin)] : [],
    };
  }

  private createBroadcastRoomStateEffect(roomCode: string, origin: string): RoomRuntimeEffect {
    return this.createRoomStateBroadcastEffect(roomCode, origin);
  }
}
