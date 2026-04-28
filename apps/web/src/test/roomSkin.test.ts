import { describe, expect, it } from 'vitest';
import { GAME_WEB_CONFIG } from '../game';
import { buildPlayerAccentMap, getShellPlayerAccentColors } from '../components/room-page/helpers';

describe('room skin helpers', () => {
  it('sources player accent colors from the resolved shell skin', () => {
    expect(getShellPlayerAccentColors()).toBe(GAME_WEB_CONFIG.ui.skin.tokens.playerAccentColors);

    const accents = buildPlayerAccentMap([
      { id: 'p1' },
      { id: 'p2' },
    ] as never);

    expect(accents.get('p1')).toBe(GAME_WEB_CONFIG.ui.skin.tokens.playerAccentColors[0]);
    expect(accents.get('p2')).toBe(GAME_WEB_CONFIG.ui.skin.tokens.playerAccentColors[1]);
  });

  it('lets tests and fixtures pass explicit player accent colors', () => {
    const accents = buildPlayerAccentMap([
      { id: 'p1' },
      { id: 'p2' },
      { id: 'p3' },
    ] as never, ['#111111', '#222222']);

    expect(accents).toEqual(new Map([
      ['p1', '#111111'],
      ['p2', '#222222'],
      ['p3', '#111111'],
    ]));
  });
});
