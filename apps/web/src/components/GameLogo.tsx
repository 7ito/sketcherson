import type { ResolvedShellUiConfig } from '@sketcherson/common/game';
import { GAME_WEB_CONFIG } from '../game';

export function GameLogo({
  className,
  logo = GAME_WEB_CONFIG.ui.logo,
  partClassNames = ['logo-part-primary', 'logo-part-accent'],
}: {
  className?: string;
  logo?: ResolvedShellUiConfig['logo'];
  partClassNames?: readonly (string | undefined)[];
}) {
  return (
    <span className={className} aria-label={logo.ariaLabel}>
      {logo.parts.map((part, index) => (
        <span key={`${part}-${index}`} className={partClassNames[index]}>
          {part}
        </span>
      ))}
    </span>
  );
}
