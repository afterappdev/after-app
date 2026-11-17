import {
  aggregateFromDateMap,
  ingestFirstTimeDownloadsByDate,
  isAppStoreDownloadsStandardReport,
} from './apple-download-tsv';

describe('isAppStoreDownloadsStandardReport', () => {
  it('aceita App Store Downloads Standard', () => {
    expect(isAppStoreDownloadsStandardReport('App Downloads Standard')).toBe(true);
    expect(isAppStoreDownloadsStandardReport('App Downloads Detailed')).toBe(false);
  });
});

describe('ingestFirstTimeDownloadsByDate', () => {
  it('combina por data e ignora redownload', () => {
    const byDate = new Map<string, number>();
    const tsvA = [
      'Date\tDownload Type\tCounts',
      '2026-10-01\tFirst-time Download\t5',
      '2026-10-02\tRedownload\t9',
    ].join('\n');
    const tsvB = [
      'Date\tDownload Type\tCounts',
      '2026-10-02\tFirst-time Download\t2',
    ].join('\n');
    ingestFirstTimeDownloadsByDate(tsvA, byDate);
    ingestFirstTimeDownloadsByDate(tsvB, byDate);
    expect(byDate.get('2026-10-01')).toBe(5);
    expect(byDate.get('2026-10-02')).toBe(2);
    const agg = aggregateFromDateMap(byDate);
    expect(agg).toEqual({
      total: 7,
      firstDataDate: '2026-10-01',
      lastDataDate: '2026-10-02',
    });
  });
});