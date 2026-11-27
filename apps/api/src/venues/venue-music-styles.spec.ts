import { storedMusicStyle, VENUE_MUSIC_STYLES } from './venue-music-styles';

describe('venue music styles', () => {
  it('keeps a catalog label and clears blanks', () => {
    expect(VENUE_MUSIC_STYLES).toContain('Sertanejo');
    expect(storedMusicStyle(' Funk ')).toBe('Funk');
    expect(storedMusicStyle('')).toBeNull();
    expect(storedMusicStyle('   ')).toBeNull();
    expect(storedMusicStyle(null)).toBeNull();
  });

  it('rejects a style outside the catalog', () => {
    expect(storedMusicStyle('Ópera')).toBeUndefined();
  });
});
