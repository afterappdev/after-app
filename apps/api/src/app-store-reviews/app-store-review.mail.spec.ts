import {
  buildAppStoreReviewEmail,
  escapeReviewerPlainText,
  formatStars,
} from './app-store-review-mail';

describe('app-store-review-mail', () => {
  it('remove controles e limita tamanho', () => {
    expect(escapeReviewerPlainText('ok\x00bad')).toBe('okbad');
    expect(escapeReviewerPlainText('a'.repeat(10), 5)).toBe('aaaaa…');
  });

  it('monta estrelas', () => {
    expect(formatStars(4)).toBe('★★★★☆ (4/5)');
  });

  it('escapa conteúdo do avaliador no corpo do e-mail', () => {
    const { text, subject } = buildAppStoreReviewEmail({
      appAppleId: '6812746791',
      review: {
        id: 'rev-1',
        rating: 5,
        title: 'ótimo <script>',
        body: 'linha1\nlinha2\x07',
        reviewerNickname: 'Pedro',
        territory: 'BRA',
        createdAt: new Date('2026-11-17T12:00:00.000Z'),
      },
    });
    expect(subject).toContain('★');
    expect(text).toContain('ótimo <script>');
    expect(text).not.toMatch(/\x07/);
    expect(text).toContain('6812746791');
    expect(text).toContain('rev-1');
  });
});