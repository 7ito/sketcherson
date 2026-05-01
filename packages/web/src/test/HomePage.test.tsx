import type { ApiResult, CreateRoomSuccess, DrawingActionSuccess, JoinRoomSuccess, LobbyDrawingActionSuccess, ReclaimRoomSuccess, RerollTurnSuccess, RoomStateSuccess, StartRoomSuccess, SubmitMessageSuccess, UpdateLobbySettingsSuccess } from '@sketcherson/common/room';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../components/HomePage';
import { FanProjectNotice } from '../components/FanProjectNotice';
import { RoomSessionContext } from '../providers/RoomSessionProvider';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../game';

function renderHomePage() {
  return render(
    <MemoryRouter>
      <RoomSessionContext.Provider
        value={{
          activeRoom: null,
          joinedSession: null,
          sessionRecoveryError: null,
          roomExitNotice: null,
          connectionNotice: null,
          createRoom: vi.fn<() => Promise<ApiResult<CreateRoomSuccess>>>(),
          joinRoom: vi.fn<() => Promise<ApiResult<JoinRoomSuccess>>>(),
          reclaimStoredSession: vi.fn<() => Promise<ApiResult<ReclaimRoomSuccess> | null>>(),
          lookupRoom: vi.fn<() => Promise<ApiResult<RoomStateSuccess>>>(),
          updateLobbySettings: vi.fn<() => Promise<ApiResult<UpdateLobbySettingsSuccess>>>(),
          startRoom: vi.fn<() => Promise<ApiResult<StartRoomSuccess>>>(),
          pauseRoom: vi.fn(),
          resumeRoom: vi.fn(),
          kickPlayer: vi.fn(),
          rerollTurn: vi.fn<() => Promise<ApiResult<RerollTurnSuccess>>>(),
          submitDrawingAction: vi.fn<() => Promise<ApiResult<DrawingActionSuccess>>>(),
          submitLobbyDrawingAction: vi.fn<() => Promise<ApiResult<LobbyDrawingActionSuccess>>>(),
          submitRoomMessage: vi.fn<() => Promise<ApiResult<SubmitMessageSuccess>>>(),
        }}
      >
        <HomePage />
      </RoomSessionContext.Provider>
    </MemoryRouter>,
  );
}

describe('HomePage game definition copy', () => {
  it('renders the configured game title, tagline, and optional legal link', () => {
    renderHomePage();

    const homeFooterNotice = GAME_WEB_CONFIG.ui.notices.find((notice) => notice.placements?.includes('home-footer'))!;

    expect(screen.getByRole('heading', { name: GAME_WEB_CONFIG.ui.logo.ariaLabel })).toBeInTheDocument();
    expect(screen.getByText(GAME_DEFINITION.tagline)).toBeInTheDocument();
    expect(screen.getByText(homeFooterNotice.shortText!, { exact: false })).toBeInTheDocument();
    if (homeFooterNotice.policyLabel) {
      expect(screen.getByRole('link', { name: homeFooterNotice.policyLabel })).toHaveAttribute(
        'href',
        homeFooterNotice.policyUrl,
      );
    } else {
      expect(screen.queryByRole('link')).toBeNull();
    }
  });

  it('renders home actions from the resolved UI config', () => {
    renderHomePage();

    expect(screen.getByRole('button', { name: new RegExp(GAME_WEB_CONFIG.ui.copy.home.createRoomButton) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(GAME_WEB_CONFIG.ui.copy.home.joinRoomButton) })).toBeInTheDocument();
    expect(screen.getByText(GAME_WEB_CONFIG.ui.copy.home.actionDivider)).toBeInTheDocument();
  });

  it('renders home modal controls from the resolved UI config', () => {
    renderHomePage();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(GAME_WEB_CONFIG.ui.copy.home.createRoomButton) }));

    expect(screen.getByRole('button', { name: GAME_WEB_CONFIG.ui.copy.home.closeDialog })).toHaveTextContent(
      GAME_WEB_CONFIG.ui.skin.tokens.icons.close,
    );
    expect(screen.getByLabelText(GAME_WEB_CONFIG.ui.copy.home.nicknameLabel)).toBeInTheDocument();
  });
});

describe('FanProjectNotice game definition copy', () => {
  it('renders the configured legal notice content', () => {
    render(<FanProjectNotice />);

    expect(screen.getByLabelText(GAME_DEFINITION.legalNotice.label)).toBeInTheDocument();
    for (const paragraph of GAME_DEFINITION.legalNotice.paragraphs) {
      expect(screen.getByText(paragraph.replace(/\.$/, ''), { exact: false })).toBeInTheDocument();
    }
    if (GAME_DEFINITION.legalNotice.policyLabel) {
      expect(screen.getByRole('link', { name: GAME_DEFINITION.legalNotice.policyLabel })).toHaveAttribute(
        'href',
        GAME_DEFINITION.legalNotice.policyUrl,
      );
    } else {
      expect(screen.queryByRole('link')).toBeNull();
    }
  });
});
