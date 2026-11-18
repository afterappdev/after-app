export type EventoSectionDef = {
  key: string;
  title: string;
};

export const EVENTO_SECTIONS: EventoSectionDef[] = [
  { key: 'after-day-1', title: 'After Day 1#' },
  { key: 'after-day-2', title: 'After Day 2#' },
];

export function normalizeEventoSectionKey(raw?: string): string {
  const key = raw?.trim();
  if (key && EVENTO_SECTIONS.some((s) => s.key === key)) return key;
  return EVENTO_SECTIONS[0]!.key;
}