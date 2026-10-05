/** Persisted category strings include the emoji prefix used by the mobile catalog. */
export const LEGACY_LIVE_MUSIC_CATEGORY = '🎵 Música ao Vivo';

/**
 * `stored` is the string already known by app 1.0.1+11.
 * `display` is the label shown by the next app.
 * Both directions match in search. Writes persist `stored`.
 */
export const VENUE_CATEGORY_RENAMES: ReadonlyArray<{
  stored: string;
  display: string;
  from: readonly string[];
}> = [
  {
    stored: '☕ Cafeterias e Docerias',
    display: '☕ Cafeterias e Padarias',
    from: [
      '☕ Cafeterias e Docerias',
      'Cafeterias e Docerias',
      '☕ Cafeterias e Padarias',
      'Cafeterias e Padarias',
    ],
  },
  {
    stored: '🍣 Culinária Internacional',
    display: '🍣 Culinária Asiática',
    from: [
      '🍣 Culinária Internacional',
      'Culinária Internacional',
      '🍣 Culinária Asiática',
      'Culinária Asiática',
    ],
  },
  {
    stored: '🎯 Lazer e Diversão',
    display: '⚽ Esportes, Lazer e Jogos',
    from: [
      '🎯 Lazer e Diversão',
      'Lazer e Diversão',
      '🎯 Jogos, Lazer e Diversão',
      'Jogos, Lazer e Diversão',
      '⚽ Esportes, Lazer e Jogos',
      'Esportes, Lazer e Jogos',
    ],
  },
  {
    stored: '🍔 Hamburguerias',
    display: '🍔 Hamburguerias e Lanchonetes',
    from: [
      '🍔 Hamburguerias',
      'Hamburguerias',
      '🍔 Hamburguerias e Lanchonetes',
      'Hamburguerias e Lanchonetes',
    ],
  },
  {
    stored: '🎡 Food Park',
    display: '🍴 Food Park',
    from: ['🎡 Food Park', 'Food Park', '🍴 Food Park'],
  },
  {
    stored: '🎶 Karaokê',
    display: '🎤 Karaokê',
    from: ['🎶 Karaokê', 'Karaokê', '🎤 Karaokê'],
  },
  {
    stored: '🍨 Sorveterias e Açaí',
    display: '🍦 Sorveterias e Açaí',
    from: [
      '🍨 Sorveterias e Açaí',
      'Sorveterias e Açaí',
      '🍦 Sorveterias e Açaí',
    ],
  },
];

/** Labels shown by the next app, alphabetical by name, ignoring the emoji. */
const CURRENT_CATEGORIES = [
  '🍷 Adegas e Wine Bars',
  '💃 Baladas e Boates',
  '🍻 Bares e Botecos',
  '☕ Cafeterias e Padarias',
  '🎤 Casas de Show',
  '🍺 Cervejarias e Choperias',
  '🥩 Churrascarias e Steakhouses',
  '🍣 Culinária Asiática',
  '🎭 Entretenimento e Eventos',
  '🍢 Espetaria',
  '⚽ Esportes, Lazer e Jogos',
  '🍴 Food Park',
  '🍔 Hamburguerias e Lanchonetes',
  '🎤 Karaokê',
  '🍸 Lounges e Rooftops',
  '🥟 Pastelaria',
  '🍕 Pizzarias',
  '🎸 Pubs',
  '🍽️ Restaurantes',
  '🥟 Salgaderia',
  '🎉 Serv-Festas',
  '🍦 Sorveterias e Açaí',
] as const;

const PROTECTED_CATEGORIES = new Set<string>([
  ...CURRENT_CATEGORIES,
  LEGACY_LIVE_MUSIC_CATEGORY,
  'Música ao Vivo',
  ...VENUE_CATEGORY_RENAMES.flatMap((rule) => [
    rule.stored,
    rule.display,
    ...rule.from,
  ]),
]);

export function isLegacyLiveMusicCategory(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed === LEGACY_LIVE_MUSIC_CATEGORY || trimmed === 'Música ao Vivo'
  );
}

/** Value written to Venue.category. Renames stay on the 1.0.1+11 string. */
export function storedCategory(value: string): string {
  const trimmed = value.trim();
  for (const rule of VENUE_CATEGORY_RENAMES) {
    if (
      rule.stored === trimmed ||
      rule.display === trimmed ||
      rule.from.includes(trimmed)
    ) {
      return rule.stored;
    }
  }
  return trimmed;
}

export function categoryMatches(
  stored: string | null | undefined,
  filter: string,
): boolean {
  if (!stored) return false;
  return storedCategory(stored) === storedCategory(filter);
}

/** Keeps catalog categories when an older client would otherwise blank them. */
export function shouldPreserveCategory(
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;
  return PROTECTED_CATEGORIES.has(stored.trim());
}
