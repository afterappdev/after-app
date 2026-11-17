import {
  fetchAllAppStoreCustomerReviews,
  type AscCustomerReview,
} from './app-store-connect-reviews.client';

function reviewPage(
  reviews: AscCustomerReview[],
  next: string | null,
): Response {
  const payload = {
    data: reviews.map((r) => ({
      type: 'customerReviews',
      id: r.id,
      attributes: {
        rating: r.rating,
        title: r.title,
        body: r.body,
        reviewerNickname: r.reviewerNickname,
        territory: r.territory,
        createdDate: r.createdAt.toISOString(),
      },
    })),
    links: { next },
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

describe('fetchAllAppStoreCustomerReviews', () => {
  it('exige credenciais ASC', async () => {
    const result = await fetchAllAppStoreCustomerReviews('6812746791', {
      jwtFactory: () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASC_CONFIG');
  });

  it('pagina até links.next acabar', async () => {
    const r1: AscCustomerReview = {
      id: 'a',
      rating: 5,
      title: 't1',
      body: 'b1',
      reviewerNickname: null,
      territory: 'BRA',
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    };
    const r2: AscCustomerReview = {
      id: 'b',
      rating: 3,
      title: 't2',
      body: 'b2',
      reviewerNickname: 'x',
      territory: 'BRA',
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
    };
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(reviewPage([r1], 'https://next'))
      .mockResolvedValueOnce(reviewPage([r2], null));

    const result = await fetchAllAppStoreCustomerReviews('6812746791', {
      jwtFactory: () => 'jwt',
      fetchFn,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reviews.map((r) => r.id)).toEqual(['a', 'b']);
    }
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});