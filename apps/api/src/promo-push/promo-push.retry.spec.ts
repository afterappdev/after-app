import { chunkList, FCM_MULTICAST_LIMIT, formatPromoPushLog } from './promo-push.retry';

describe('fcm batches', () => {
  it('parte em lotes de 500', () => {
    const items = Array.from({ length: 501 }, (_, index) => index);
    const chunks = chunkList(items, FCM_MULTICAST_LIMIT);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toEqual([500]);
  });

  it('o log aceita só contadores e descarta texto', () => {
    const line = formatPromoPushLog('evt-1', 'sent', { sent: 2, skipped: 1 });
    expect(line).toBe('promo-push event=evt-1 outcome=sent sent=2 skipped=1');
    expect(line).not.toContain('token');
  });
});
