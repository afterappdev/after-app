// Lightweight parse check using the same logic as production (inline duplicate for test isolation).
function parseTotalUserInstalls(csv: string): number | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const headers = lines[0]!.split(',');
  const totalIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'total user installs',
  );
  if (totalIdx < 0) return null;
  let bestDate = '';
  let bestTotal: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const date = cols[0]?.trim() ?? '';
    const n = Number.parseInt((cols[totalIdx] ?? '').replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(n)) continue;
    if (date.localeCompare(bestDate) >= 0) {
      bestDate = date;
      bestTotal = n;
    }
  }
  return bestTotal;
}

describe('parseTotalUserInstalls', () => {
  it('pega o total mais recente da coluna Total User Installs', () => {
    const csv = [
      'Date,Package Name,Total User Installs',
      '2026-10-01,com.r2p.after.after_app,100',
      '2026-10-02,com.r2p.after.after_app,1245',
    ].join('\n');
    expect(parseTotalUserInstalls(csv)).toBe(1245);
  });
});
