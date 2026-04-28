import { type ReactNode } from 'react';
import { GAME_WEB_CONFIG } from '../../game';
import { ConnectionStatusBanner } from '../ConnectionStatusBanner';
import { ShellNotice } from '../ShellNotice';

export function SettingsGearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="settings-gear-button" onClick={onClick} title="Settings">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
        <path
          d="M16.167 12.5a1.375 1.375 0 0 0 .275 1.517l.05.05a1.667 1.667 0 1 1-2.359 2.358l-.05-.05a1.375 1.375 0 0 0-1.516-.275 1.375 1.375 0 0 0-.834 1.258v.142a1.667 1.667 0 1 1-3.333 0v-.075a1.375 1.375 0 0 0-.9-1.258 1.375 1.375 0 0 0-1.517.275l-.05.05a1.667 1.667 0 1 1-2.358-2.359l.05-.05a1.375 1.375 0 0 0 .275-1.516 1.375 1.375 0 0 0-1.258-.834H2.5a1.667 1.667 0 0 1 0-3.333h.075a1.375 1.375 0 0 0 1.258-.9 1.375 1.375 0 0 0-.275-1.517l-.05-.05A1.667 1.667 0 1 1 5.867 3.508l.05.05a1.375 1.375 0 0 0 1.516.275h.067a1.375 1.375 0 0 0 .833-1.258V2.5a1.667 1.667 0 0 1 3.334 0v.075a1.375 1.375 0 0 0 .833 1.258 1.375 1.375 0 0 0 1.517-.275l.05-.05a1.667 1.667 0 1 1 2.358 2.358l-.05.05a1.375 1.375 0 0 0-.275 1.517v.067a1.375 1.375 0 0 0 1.258.833h.142a1.667 1.667 0 0 1 0 3.334h-.075a1.375 1.375 0 0 0-1.258.833Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function RoomPageFrame({
  width,
  connectionNotice,
  noticePlacement = 'above',
  children,
}: {
  width: 'narrow' | 'wide';
  connectionNotice: { state: string; message: string } | null | undefined;
  noticePlacement?: 'above' | 'below';
  children: ReactNode;
}) {
  const presentation = GAME_WEB_CONFIG.ui.presentation;

  return (
    <main
      className={`page-shell ${width} page-stack`}
      data-shell-room-density={presentation.layout.room.density}
      data-shell-button-style={presentation.components.buttonStyle}
      data-shell-badge-style={presentation.components.badgeStyle}
      data-shell-card-style={presentation.components.cardStyle}
    >
      {noticePlacement === 'above' ? <ShellNotice placement="room-frame" /> : null}
      {connectionNotice ? (
        <ConnectionStatusBanner
          tone={connectionNotice.state === 'offline' ? 'danger' : 'warning'}
          message={connectionNotice.message}
        />
      ) : null}
      {children}
      {noticePlacement === 'below' ? <ShellNotice placement="room-frame" /> : null}
    </main>
  );
}

export function CenteredRoomStatus({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel centered-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      {action}
    </section>
  );
}
