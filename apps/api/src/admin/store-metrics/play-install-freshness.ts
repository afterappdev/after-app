const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dias entre o último dia do CSV Play e hoje (UTC, calendário). */
export function playInstallDataLagDays(
  lastDataDate: string | null | undefined,
  now = new Date(),
): number | null {
  if (!lastDataDate?.trim()) return null;
  const match = YMD.exec(lastDataDate.trim());
  if (!match) return null;
  const lastUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.max(0, Math.floor((todayUtc - lastUtc) / 86_400_000));
}

/** Play costuma publicar o GCS com 2–5 dias de atraso; refresh curto enquanto faltar dia recente. */
export function playInstallCountsStale(
  lastDataDate: string | null | undefined,
  now = new Date(),
): boolean {
  const lag = playInstallDataLagDays(lastDataDate, now);
  return lag === null ? true : lag >= 2;
}