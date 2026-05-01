import { render, screen } from '@testing-library/react';
import { GameLogo } from '../components/GameLogo';
import { GAME_WEB_CONFIG } from '../game';

describe('GameLogo', () => {
  it('renders the resolved game logo by default', () => {
    render(<GameLogo className="test-logo" />);

    expect(screen.getByLabelText(GAME_WEB_CONFIG.ui.logo.ariaLabel)).toHaveClass('test-logo');
    expect(screen.getByText(GAME_WEB_CONFIG.ui.logo.parts[0])).toHaveClass('logo-part-primary');
    expect(screen.getByText(GAME_WEB_CONFIG.ui.logo.parts[1])).toHaveClass('logo-part-accent');
  });

  it('supports one, two, or many logo parts without assuming a fixed count', () => {
    render(
      <GameLogo
        logo={{ ariaLabel: 'Custom Game', parts: ['One', 'Two', 'Three'] }}
        partClassNames={['first-part', 'second-part']}
      />,
    );

    expect(screen.getByLabelText('Custom Game')).toBeInTheDocument();
    expect(screen.getByText('One')).toHaveClass('first-part');
    expect(screen.getByText('Two')).toHaveClass('second-part');
    expect(screen.getByText('Three')).not.toHaveAttribute('class');
  });
});
