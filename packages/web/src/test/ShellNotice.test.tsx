import type { ShellNoticeConfig } from '@7ito/sketcherson-common/game';
import { render, screen } from '@testing-library/react';
import { ShellNotice, selectShellNoticesByPlacement } from '../components/ShellNotice';

const roomNotice: ShellNoticeConfig = {
  id: 'room-notice',
  label: 'Room notice',
  shortText: 'Short room notice.',
  policyLabel: 'example.com/policy',
  policyUrl: 'https://example.com/policy',
  paragraphs: ['Room paragraph.', 'Second paragraph.'],
  placements: ['room-frame'],
};

const postgameNotice: ShellNoticeConfig = {
  id: 'postgame-notice',
  label: 'Postgame notice',
  shortText: 'Short postgame notice.',
  placements: ['postgame-gallery'],
};

describe('ShellNotice', () => {
  it('selects notices by placement', () => {
    expect(selectShellNoticesByPlacement([roomNotice, postgameNotice], 'room-frame')).toEqual([roomNotice]);
    expect(selectShellNoticesByPlacement([roomNotice, postgameNotice], 'postgame-gallery')).toEqual([postgameNotice]);
    expect(selectShellNoticesByPlacement([roomNotice, postgameNotice], 'home-footer')).toEqual([]);
  });

  it('renders nothing when no notice matches the requested placement', () => {
    const { container } = render(<ShellNotice placement="room-frame" notices={[postgameNotice]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders generic notice content for the requested placement', () => {
    render(<ShellNotice placement="room-frame" notices={[roomNotice, postgameNotice]} />);

    expect(screen.getByLabelText('Room notice')).toBeInTheDocument();
    expect(screen.getByText('Room paragraph', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'example.com/policy' })).toHaveAttribute('href', 'https://example.com/policy');
    expect(screen.queryByLabelText('Postgame notice')).not.toBeInTheDocument();
  });

  it('falls back to short text for notices without paragraph content', () => {
    render(<ShellNotice placement="postgame-gallery" notices={[postgameNotice]} />);

    expect(screen.getByLabelText('Postgame notice')).toBeInTheDocument();
    expect(screen.getByText('Short postgame notice.')).toBeInTheDocument();
  });
});
