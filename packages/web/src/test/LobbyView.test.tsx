import { describe, expect, it } from 'vitest';
import { buildLobbyInviteUrl } from '../components/room-page/LobbyView';

describe('buildLobbyInviteUrl', () => {
  it('uses the browser origin instead of a stale server share URL', () => {
    expect(
      buildLobbyInviteUrl(
        { code: 'ABCDEF', shareUrl: 'http://localhost:5173/room/ABCDEF' },
        'https://sketcherson.example',
      ),
    ).toBe('https://sketcherson.example/room/ABCDEF');
  });

  it('falls back to the server share URL when no browser origin is available', () => {
    expect(
      buildLobbyInviteUrl(
        { code: 'ABCDEF', shareUrl: 'https://server.example/room/ABCDEF' },
        '',
      ),
    ).toBe('https://server.example/room/ABCDEF');
  });
});
