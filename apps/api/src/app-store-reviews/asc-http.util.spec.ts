import { fetchAscJsonWithBackoff } from './asc-http.util';

describe('fetchAscJsonWithBackoff', () => {
  it('repete em HTTP 500 e depois retorna 200', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            errors: [{ code: 'UNEXPECTED_ERROR', title: 'err' }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'req-1' },
        text: async () => JSON.stringify({ data: [] }),
      });

    const { res, attempts } = await fetchAscJsonWithBackoff(
      'https://example.test/reviews',
      'jwt',
      fetchFn as unknown as typeof fetch,
      { maxAttempts: 3 },
    );
    expect(attempts).toBe(2);
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});