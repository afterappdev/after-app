export type VipPushSlot = {
  index: 1 | 2;
  minuteOfDay: number;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Up to two daily VIP push times in America/Sao_Paulo.
 * An empty, invalid, or longer list sends nothing. No commercial
 * default is assumed while the times are still unapproved.
 */
export function readVipPushSlots(
  env: NodeJS.ProcessEnv = process.env,
): VipPushSlot[] {
  const raw = env.PROMO_PUSH_VIP_SLOT_TIMES?.trim() ?? '';
  if (!raw) return [];
  const parts = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (parts.length === 0 || parts.length > 2) return [];
  const minutes: number[] = [];
  for (const part of parts) {
    const match = TIME.exec(part);
    if (!match) return [];
    minutes.push(Number(match[1]) * 60 + Number(match[2]));
  }
  if (new Set(minutes).size !== minutes.length) return [];
  return minutes.map((minuteOfDay, position) => ({
    index: (position + 1) as 1 | 2,
    minuteOfDay,
  }));
}
