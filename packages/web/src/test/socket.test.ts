import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ connected: false })),
}));

const mockedIo = vi.mocked(io);

describe('socket runtime configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    mockedIo.mockClear();
    Reflect.deleteProperty(window, 'SKETCHERSON_SERVER_URL');
    window.history.replaceState(null, '', '/room/ABCDEF');
  });

  it('defaults sockets to the browser origin at runtime', async () => {
    await import('../lib/socket');

    expect(mockedIo).toHaveBeenNthCalledWith(1, window.location.origin, {
      autoConnect: true,
      transports: ['websocket'],
    });
    expect(mockedIo).toHaveBeenNthCalledWith(2, `${window.location.origin}/drawing`, {
      autoConnect: true,
      transports: ['websocket'],
      multiplex: false,
    });
  });

  it('allows consuming apps to provide a runtime server URL', async () => {
    (window as Window & { SKETCHERSON_SERVER_URL?: string }).SKETCHERSON_SERVER_URL = 'https://api.sketcherson.example/';

    await import('../lib/socket');

    expect(mockedIo).toHaveBeenNthCalledWith(1, 'https://api.sketcherson.example', expect.any(Object));
    expect(mockedIo).toHaveBeenNthCalledWith(2, 'https://api.sketcherson.example/drawing', expect.any(Object));
  });
});
