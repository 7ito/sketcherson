import type { DrawingState } from '@7ito/sketcherson-common/drawing';
import type { ApiResult, LobbyDrawingActionSuccess, LobbySettings, RoomState } from '@7ito/sketcherson-common/room';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildLobbyInviteUrl, LobbyView } from '../components/room-page/LobbyView';
import { WebExtensionSlotsProvider, type SketchersonWebSlots } from '../components/WebExtensionSlots';

function buildDrawingState(): DrawingState {
  return {
    width: 800,
    height: 600,
    operations: [],
    undoneOperations: [],
    activeStrokes: [],
    revision: 0,
    snapshotDataUrl: null,
  };
}

function buildRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDEF',
    shareUrl: 'https://sketcherson.example/room/ABCDEF',
    status: 'lobby',
    match: null,
    lobbyDrawing: buildDrawingState(),
    lobbyFeed: [],
    settings: {
      roundTimerSeconds: 90,
      firstCorrectGuessTimeCapSeconds: 30,
      guessingDelaySeconds: 0,
      turnsPerPlayer: 1,
      artEnabled: true,
    },
    players: [
      { id: 'host-1', nickname: 'Host', connected: true, reconnectBy: null, isHost: true },
      { id: 'guest-1', nickname: 'Guest', connected: true, reconnectBy: null, isHost: false },
    ],
    ...overrides,
  };
}

function renderLobbyView({
  room = buildRoom(),
  currentPlayerId = 'host-1',
  slots,
  onSaveSettings = vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
}: {
  room?: RoomState;
  currentPlayerId?: string;
  slots?: SketchersonWebSlots;
  onSaveSettings?: (settings: LobbySettings) => Promise<string | null>;
} = {}) {
  return render(
    <WebExtensionSlotsProvider slots={slots}>
      <LobbyView
        room={room}
        currentPlayerId={currentPlayerId}
        connectionNotice={null}
        onSaveSettings={onSaveSettings}
        onStart={vi.fn<() => Promise<string | null>>().mockResolvedValue(null)}
        onKickPlayer={vi.fn<() => Promise<string | null>>().mockResolvedValue(null)}
        onSubmitLobbyDrawingAction={vi.fn<() => Promise<ApiResult<LobbyDrawingActionSuccess>>>()}
        onSubmitMessage={vi.fn<() => Promise<string | null>>().mockResolvedValue(null)}
        onOpenSettings={vi.fn()}
      />
    </WebExtensionSlotsProvider>,
  );
}

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

describe('LobbyView settings', () => {
  it('lets the host choose unlimited rerolls from the default settings panel', async () => {
    const onSaveSettings = vi.fn<(settings: LobbySettings) => Promise<string | null>>().mockResolvedValue(null);

    renderLobbyView({ onSaveSettings });

    const rerollsSelect = screen.getByLabelText('Rerolls per turn') as HTMLSelectElement;
    expect(Array.from(rerollsSelect.options, (option) => option.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'unlimited']);

    fireEvent.change(rerollsSelect, { target: { value: 'unlimited' } });

    await waitFor(() => {
      expect(onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ rerollsPerTurn: 'unlimited' }));
    });
  });
});

describe('LobbyView extension slots', () => {
  it('renders an injected lobby settings panel and lets it update settings', async () => {
    const onSaveSettings = vi.fn<(settings: LobbySettings) => Promise<string | null>>().mockResolvedValue(null);

    renderLobbyView({
      onSaveSettings,
      slots: {
        lobbySettingsPanel: ({ room, currentPlayerId, settings, canEditSettings, disabled, onChange }) => (
          <section aria-label="Injected lobby settings">
            <p>Injected settings for {room.code} as {currentPlayerId}</p>
            <p>{canEditSettings && !disabled ? 'Editable settings' : 'Read only settings'}</p>
            <button
              type="button"
              onClick={() => {
                void onChange({ ...settings, turnsPerPlayer: 2 });
              }}
            >
              Set two turns
            </button>
          </section>
        ),
      },
    });

    expect(screen.getByText('Injected settings for ABCDEF as host-1')).toBeInTheDocument();
    expect(screen.getByText('Editable settings')).toBeInTheDocument();
    expect(screen.queryByText('Round timer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set two turns' }));

    await waitFor(() => {
      expect(onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ turnsPerPlayer: 2 }));
    });
  });

  it('passes the default lobby settings panel to the slot for composition', () => {
    renderLobbyView({
      slots: {
        lobbySettingsPanel: ({ defaultPanel }) => (
          <section aria-label="Wrapped lobby settings">
            <p>Custom settings wrapper</p>
            {defaultPanel}
          </section>
        ),
      },
    });

    expect(screen.getByText('Custom settings wrapper')).toBeInTheDocument();
    expect(screen.getByText('Round timer')).toBeInTheDocument();
  });
});
