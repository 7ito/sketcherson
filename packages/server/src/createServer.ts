import type { CreateGameServerOptions, GameDefinition, GamePack, ServerGameRuntime } from '@sketcherson/common/game';
import { createServerGameRuntime } from '@sketcherson/common/game';
import type { PromptEngine } from '@sketcherson/common/prompts';
import type {
  RoomClientEventName,
  RoomClientToServerSocketEvents,
  RoomRequest,
  RoomResponse,
  RoomServerToClientSocketEvents,
} from '@sketcherson/common/roomEvents';
import { createServer as createHttpServer } from 'node:http';
import { Server } from 'socket.io';
import { estimateSerializedPayloadBytes, logDrawingTransportMetric } from './drawingMetrics';
import { RoomRuntime, type RoomRuntimeEffect } from './domain/roomRuntime';
import { logServerError, logServerEvent } from './logger';

interface ActionSuccess {
  ok: true;
  data: unknown;
}

export const SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES = 1_000_000;
export const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
export const ROOM_IDLE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface GameServer {
  io: Server<RoomClientToServerSocketEvents, RoomServerToClientSocketEvents>;
  httpServer: ReturnType<typeof createHttpServer>;
  roomRuntime: RoomRuntime;
  start: (port?: number, host?: string) => Promise<number>;
  stop: () => Promise<void>;
}

export function createGameServer(options?: Partial<CreateGameServerOptions<any>> & {
  appOrigin?: string;
  corsOrigin?: string;
  referenceArtEnabled?: boolean;
  countdownMs?: number;
  revealMs?: number;
  reconnectGraceMs?: number;
  pauseMaxMs?: number;
  pauseCooldownMs?: number;
  roundDurationOverrideMs?: number;
  random?: () => number;
  roomIdleTtlMs?: number;
  roomIdleCleanupIntervalMs?: number;
  gameRuntime?: ServerGameRuntime<any>;
  gameDefinition?: GameDefinition;
  gamePack?: GamePack<any>;
  promptEngine?: PromptEngine;
}): GameServer {
  const appOrigin = options?.appOrigin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const corsOrigin = options?.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const referenceArtEnabledDefault = options?.referenceArtEnabled ?? true;
  const referenceArtEnabled =
    options?.referenceArtEnabled ??
    readBooleanFlag(process.env.ALLOW_REFERENCE_ART, referenceArtEnabledDefault, 'ALLOW_REFERENCE_ART');
  const gameRuntime = options?.gameRuntime
    ?? (options?.gamePack ? createServerGameRuntime(options.gamePack) : undefined);
  const gameDefinition = gameRuntime?.definition ?? options?.gameDefinition;
  const httpServer = createHttpServer();
  let idleCleanupTimer: ReturnType<typeof setInterval> | null = null;
  const io = new Server<RoomClientToServerSocketEvents, RoomServerToClientSocketEvents>(httpServer, {
    cors: {
      origin: corsOrigin,
    },
    maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES,
  });
  const roomRuntime = new RoomRuntime({
    countdownMs: options?.countdownMs,
    revealMs: options?.revealMs,
    reconnectGraceMs: options?.reconnectGraceMs,
    pauseMaxMs: options?.pauseMaxMs,
    pauseCooldownMs: options?.pauseCooldownMs,
    roundDurationOverrideMs: options?.roundDurationOverrideMs,
    referenceArtEnabled,
    random: options?.random,
    gameRuntime,
    gameDefinition,
    promptEngine: options?.promptEngine,
  });

  const applyRoomRuntimeEffects = (effects: RoomRuntimeEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case 'joinTransportRoom':
          io.sockets.sockets.get(effect.connectionId)?.join(effect.roomCode);
          break;
        case 'leaveTransportRoom':
          io.sockets.sockets.get(effect.connectionId)?.leave(effect.roomCode);
          break;
        case 'emit':
          (io.to(effect.connectionId).emit as (event: string, payload: unknown) => boolean)(effect.event, effect.payload);
          break;
        case 'broadcastRoomState':
          for (const target of effect.targets) {
            io.to(target.connectionId).emit('room:state', target.room);
          }
          break;
        case 'broadcastDrawingAction':
          io.to(effect.roomCode).emit(
            effect.target === 'match' ? 'room:drawingActionApplied' : 'room:lobbyDrawingActionApplied',
            effect.event,
          );
          break;
      }
    }
  };

  roomRuntime.onRoomChangedEffect(appOrigin, (effect) => {
    applyRoomRuntimeEffects([effect]);
  });

  const logFailedAction = (action: string, socketId: string, payload: unknown, error: { code: string; message: string }) => {
    logServerEvent(error.code === 'ROOM_NOT_FOUND' || error.code === 'SESSION_EXPIRED' ? 'warn' : 'info', `${action}.failed`, {
      socketId,
      payload,
      error,
    });
  };

  io.on('connection', (socket) => {
    const registerRoomAction = <E extends RoomClientEventName, TResult extends RoomResponse<E> = RoomResponse<E>>(
      eventName: E,
      actionName: string,
      run: (payload: RoomRequest<E>) => TResult,
      options?: {
        mapFailurePayload?: (payload: RoomRequest<E>) => unknown;
        logSuccess?: (result: Extract<TResult, ActionSuccess>, payload: RoomRequest<E>) => Record<string, unknown> | null;
        onSuccess?: (result: Extract<TResult, ActionSuccess>, payload: RoomRequest<E>) => void;
        broadcastOnSuccess?: boolean;
        skipBroadcastToSender?: boolean;
      },
    ) => {
      (socket.on as (event: string, listener: (...args: any[]) => void) => void)(eventName, (payload: RoomRequest<E>, ack?: (result: RoomResponse<E>) => void) => {
        const result = run(payload);

        if (!result.ok) {
          logFailedAction(actionName, socket.id, options?.mapFailurePayload?.(payload) ?? payload, result.error);
          ack?.(result as RoomResponse<E>);
          return;
        }

        const successResult = result as Extract<TResult, ActionSuccess>;
        const successLogFields = options?.logSuccess?.(successResult, payload);
        if (successLogFields) {
          logServerEvent('info', `${actionName}.succeeded`, successLogFields);
        }

        options?.onSuccess?.(successResult, payload);
        ack?.(result as RoomResponse<E>);

        if (options?.broadcastOnSuccess ?? true) {
          const roomCode = getRoomCodeFromActionResult(successResult);
          if (roomCode) {
            applyRoomRuntimeEffects([
              roomRuntime.createRoomStateBroadcastEffect(roomCode, appOrigin, {
                exceptConnectionId: options?.skipBroadcastToSender ? socket.id : undefined,
              }),
            ]);
          }
        }
      });
    };

    logServerEvent('info', 'socket.connected', {
      socketId: socket.id,
    });

    registerRoomAction(
      'room:create',
      'room.create',
      (payload) => {
        const outcome = roomRuntime.createRoomOutcome({ connectionId: socket.id, origin: appOrigin, nickname: payload.nickname });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
          playerId: result.data.playerId,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:join',
      'room.join',
      (payload) => {
        const outcome = roomRuntime.joinRoomOutcome({
          connectionId: socket.id,
          origin: appOrigin,
          code: payload.code,
          nickname: payload.nickname,
        });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
          playerId: result.data.playerId,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:reclaim',
      'room.reclaim',
      (payload) => {
        const outcome = roomRuntime.reclaimRoomOutcome({
          connectionId: socket.id,
          origin: appOrigin,
          code: payload.code,
          sessionToken: payload.sessionToken,
        });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        mapFailurePayload: (payload) => ({ code: payload.code }),
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
          playerId: result.data.playerId,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:getState',
      'room.getState',
      (payload) => roomRuntime.getRoomState({ origin: appOrigin, code: payload.code, viewerConnectionId: socket.id }),
      {
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:updateSettings',
      'room.updateSettings',
      (payload) => {
        const outcome = roomRuntime.updateLobbySettingsOutcome({ connectionId: socket.id, origin: appOrigin, payload: { settings: payload.settings } });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      { broadcastOnSuccess: false },
    );

    registerRoomAction(
      'room:start',
      'room.start',
      () => {
        const outcome = roomRuntime.startRoomOutcome({ connectionId: socket.id, origin: appOrigin });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:pause',
      'room.pause',
      () => {
        const outcome = roomRuntime.pauseRoomOutcome({ connectionId: socket.id, origin: appOrigin });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:resume',
      'room.resume',
      () => {
        const outcome = roomRuntime.resumeRoomOutcome({ connectionId: socket.id, origin: appOrigin });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:kick',
      'room.kick',
      (payload) => {
        const outcome = roomRuntime.kickPlayerOutcome({ connectionId: socket.id, origin: appOrigin, payload: { playerId: payload.playerId } });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        logSuccess: (result) => ({
          socketId: socket.id,
          roomCode: result.data.room.code,
          kickedPlayerId: result.data.kickedPlayerId,
        }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:reroll',
      'room.reroll',
      () => {
        const outcome = roomRuntime.rerollTurnOutcome({ connectionId: socket.id, origin: appOrigin });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      { broadcastOnSuccess: false },
    );

    registerRoomAction(
      'room:drawingAction',
      'room.drawingAction',
      (payload) => {
        const outcome = roomRuntime.applyDrawingActionOutcome({ connectionId: socket.id, origin: appOrigin, payload: { action: payload.action } });
        const drawingEffect = outcome.effects.find((effect) => effect.type === 'broadcastDrawingAction');
        if (outcome.response.ok && drawingEffect?.type === 'broadcastDrawingAction') {
          logDrawingTransportMetric('drawing.transport', {
            actionType: payload.action.type,
            target: 'match',
            roomCode: outcome.response.data.roomCode,
            revision: outcome.response.data.revision,
            ackBytes: estimateSerializedPayloadBytes(outcome.response),
            eventBytes: estimateSerializedPayloadBytes(drawingEffect.event),
          });
        }
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        mapFailurePayload: (payload) => ({ code: payload.code, type: payload.action.type }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:lobbyDrawingAction',
      'room.lobbyDrawingAction',
      (payload) => {
        const outcome = roomRuntime.applyLobbyDrawingActionOutcome({ connectionId: socket.id, origin: appOrigin, payload: { action: payload.action } });
        const drawingEffect = outcome.effects.find((effect) => effect.type === 'broadcastDrawingAction');
        if (outcome.response.ok && drawingEffect?.type === 'broadcastDrawingAction') {
          logDrawingTransportMetric('drawing.transport', {
            actionType: payload.action.type,
            target: 'lobby',
            roomCode: outcome.response.data.roomCode,
            revision: outcome.response.data.revision,
            ackBytes: estimateSerializedPayloadBytes(outcome.response),
            eventBytes: estimateSerializedPayloadBytes(drawingEffect.event),
          });
        }
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        mapFailurePayload: (payload) => ({ code: payload.code, type: payload.action.type }),
        broadcastOnSuccess: false,
      },
    );

    registerRoomAction(
      'room:submitMessage',
      'room.submitMessage',
      (payload) => {
        const outcome = roomRuntime.submitMessageOutcome({ connectionId: socket.id, origin: appOrigin, payload: { text: payload.text } });
        applyRoomRuntimeEffects(outcome.effects);
        return outcome.response;
      },
      {
        mapFailurePayload: (payload) => ({ code: payload.code }),
        broadcastOnSuccess: false,
      },
    );

    socket.on('disconnect', () => {
      const outcome = roomRuntime.disconnectOutcome({ connectionId: socket.id, origin: appOrigin });

      logServerEvent('info', 'socket.disconnected', {
        socketId: socket.id,
        roomCode: outcome.response.ok ? outcome.response.data : null,
      });

      applyRoomRuntimeEffects(outcome.effects);
    });
  });

  return {
    io,
    httpServer,
    roomRuntime,
    start: async (port = Number(process.env.PORT ?? 3001), host = process.env.HOST) => {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, host, resolve);
      });

      const roomIdleCleanupIntervalMs = options?.roomIdleCleanupIntervalMs ?? ROOM_IDLE_CLEANUP_INTERVAL_MS;
      const roomIdleTtlMs = options?.roomIdleTtlMs ?? ROOM_IDLE_TTL_MS;
      idleCleanupTimer = setInterval(() => {
        const deletedRoomCodes = roomRuntime.deleteIdleRooms(roomIdleTtlMs);
        for (const roomCode of deletedRoomCodes) {
          logServerEvent('info', 'room.idle.deleted', { roomCode, idleTtlMs: roomIdleTtlMs });
        }
      }, roomIdleCleanupIntervalMs);
      idleCleanupTimer.unref();

      const address = httpServer.address();
      if (address && typeof address === 'object') {
        logServerEvent('info', 'server.started', {
          port: address.port,
          host: address.address,
          appOrigin,
          corsOrigin,
          referenceArtEnabled,
        });
        return address.port;
      }

      logServerEvent('info', 'server.started', {
        port,
        host,
        appOrigin,
        corsOrigin,
        referenceArtEnabled,
      });
      return port;
    },
    stop: async () => {
      if (idleCleanupTimer) {
        clearInterval(idleCleanupTimer);
        idleCleanupTimer = null;
      }
      roomRuntime.destroy();
      await new Promise<void>((resolve) => {
        io.close(() => {
          resolve();
        });
      });
      logServerEvent('info', 'server.stopped');
    },
  };
}

function getRoomCodeFromActionResult(result: ActionSuccess): string | null {
  const data = result.data;
  if (!data || typeof data !== 'object' || !('room' in data)) {
    return null;
  }

  const room = (data as { room?: unknown }).room;
  if (!room || typeof room !== 'object' || !('code' in room)) {
    return null;
  }

  const code = (room as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function readBooleanFlag(rawValue: string | undefined, defaultValue: boolean, name: string): boolean {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  logServerError('server.invalid_boolean_flag', new Error(`Invalid boolean flag value: ${rawValue}`), {
    name,
    defaultValue,
  });
  return defaultValue;
}
