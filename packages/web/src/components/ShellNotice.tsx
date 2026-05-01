import type { ShellNoticeConfig } from '@sketcherson/common/game';
import { GAME_WEB_CONFIG } from '../game';

export type ShellNoticePlacement = NonNullable<ShellNoticeConfig['placements']>[number];

export function selectShellNoticesByPlacement(
  notices: readonly ShellNoticeConfig[],
  placement: ShellNoticePlacement,
): ShellNoticeConfig[] {
  return notices.filter((notice) => notice.placements?.includes(placement));
}

export function ShellNotice({
  placement,
  notices = GAME_WEB_CONFIG.ui.notices,
}: {
  placement: ShellNoticePlacement;
  notices?: readonly ShellNoticeConfig[];
}) {
  const matchingNotices = selectShellNoticesByPlacement(notices, placement);

  if (matchingNotices.length === 0) {
    return null;
  }

  return (
    <>
      {matchingNotices.map((notice) => (
        <ShellNoticeContent key={notice.id} notice={notice} />
      ))}
    </>
  );
}

function ShellNoticeContent({ notice }: { notice: ShellNoticeConfig }) {
  const paragraphs = notice.paragraphs ?? [];
  const [firstParagraph, ...remainingParagraphs] = paragraphs;

  return (
    <section className="fan-project-notice" aria-label={notice.label}>
      <p className="eyebrow">{notice.label}</p>
      {firstParagraph ? (
        <p>
          {notice.policyUrl && notice.policyLabel ? firstParagraph.replace(/\.$/, '') : firstParagraph}
          {notice.policyUrl && notice.policyLabel ? (
            <>
              :{' '}
              <a href={notice.policyUrl} target="_blank" rel="noreferrer">
                {notice.policyLabel}
              </a>
              .
            </>
          ) : null}
        </p>
      ) : notice.shortText ? (
        <p>{notice.shortText}</p>
      ) : null}
      {remainingParagraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}
