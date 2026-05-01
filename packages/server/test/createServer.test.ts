import { TEST_GAME_DEFINITION } from '@sketcherson/common/testing/testGame';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameServer, SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES, type GameServer } from '../src/createServer';

const ORIGIN = 'http://localhost:4173';

async function stopServer(server: GameServer): Promise<void> {
  await server.stop();
}

function startRuntimeRoom(server: GameServer) {
  const createResult = server.roomRuntime.createRoom({
    connectionId: 'socket-1',
    origin: ORIGIN,
    nickname: 'Host',
  });

  if (!createResult.ok) {
    throw new Error(`Expected room creation to succeed: ${createResult.error.message}`);
  }

  const joinResult = server.roomRuntime.joinRoom({
    connectionId: 'socket-2',
    origin: ORIGIN,
    code: createResult.data.room.code,
    nickname: 'Guest',
  });

  if (!joinResult.ok) {
    throw new Error(`Expected room join to succeed: ${joinResult.error.message}`);
  }

  const startResult = server.roomRuntime.startRoom({
    connectionId: 'socket-1',
    origin: ORIGIN,
  });

  if (!startResult.ok) {
    throw new Error(`Expected room start to succeed: ${startResult.error.message}`);
  }

  return startResult.data.room;
}

describe('createGameServer transport config', () => {
  it('caps Socket.IO HTTP payloads', async () => {
    const server = createGameServer({
      appOrigin: ORIGIN,
      corsOrigin: '*',
      gameDefinition: TEST_GAME_DEFINITION,
    });

    try {
      expect(server.io.engine.opts.maxHttpBufferSize).toBe(SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES);
    } finally {
      await stopServer(server);
    }
  });
});

describe('createGameServer reference art config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes referenceArtEnabled options into the room runtime', async () => {
    const server = createGameServer({
      appOrigin: ORIGIN,
      corsOrigin: '*',
      referenceArtEnabled: false,
      gameDefinition: TEST_GAME_DEFINITION,
    });

    try {
      const room = startRuntimeRoom(server);

      expect(room.serverReferenceArtEnabled).toBe(false);
      expect(room.match?.currentTurn?.referenceArtUrl).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it('reads ALLOW_REFERENCE_ART from the environment', async () => {
    vi.stubEnv('ALLOW_REFERENCE_ART', 'false');

    const server = createGameServer({
      appOrigin: ORIGIN,
      corsOrigin: '*',
      gameDefinition: TEST_GAME_DEFINITION,
    });

    try {
      const room = startRuntimeRoom(server);

      expect(room.serverReferenceArtEnabled).toBe(false);
    } finally {
      await stopServer(server);
    }
  });
});
