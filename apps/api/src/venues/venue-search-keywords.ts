import {
  storedCategory,
  VENUE_CATEGORY_RENAMES,
} from './venue-categories';

/**
 * Words people type that are not already inside the category label.
 * Keys are the persisted category string (`storedCategory`).
 */
const CATEGORY_WORDS: Readonly<Record<string, readonly string[]>> = {
  '🍷 Adegas e Wine Bars': ['vinho', 'vinhos'],
  '🍺 Cervejarias e Choperias': ['chopp', 'chope'],
  '🍣 Culinária Internacional': [
    'sushi',
    'japones',
    'japonesa',
    'temaki',
    'yakisoba',
    'chines',
    'chinesa',
  ],
  '🍢 Espetaria': ['espeto', 'espetinho'],
  '🍔 Hamburguerias': ['burger', 'hamburger'],
  '🥟 Salgaderia': ['salgado', 'salgados'],
  '🎯 Lazer e Diversão': ['sinuca', 'boliche'],
};

/** Labels plus the words typed in search. Only flags set on the venue are indexed. */
const AMENITY_WORDS: Readonly<Record<string, readonly string[]>> = {
  acceptsMealVoucher: ['vale refeicao', 'vale-refeicao'],
  hasKidsSpace: [
    'espaco kids',
    'area kids',
    'kids',
    'infantil',
    'crianca',
    'criancas',
  ],
  hasCoverCharge: ['entrada paga', 'couvert'],
  hasWheelchairAccess: ['acessibilidade', 'cadeirante'],
  isPetFriendly: ['pet friendly', 'pet', 'cachorro'],
  hasLiveMusic: ['musica ao vivo', 'ao vivo'],
  hasBirthdayTreat: ['aniversariante', 'aniversario'],
  hasDelivery: ['delivery', 'entrega'],
  hasGlutenFreeFood: ['sem gluten', 'gluten'],
  hasLactoseFreeFood: ['sem lactose', 'lactose'],
  hasAirConditioning: ['climatizado', 'ar condicionado'],
  hasBabyChangingRoom: ['fraldario', 'fralda'],
  hasOwnParking: ['estacionamento'],
  hasWifi: ['wi-fi', 'wifi'],
  acceptsReservations: ['reserva', 'reservas'],
  hasOutdoorArea: ['area externa', 'varanda'],
  showsSportsBroadcasts: ['transmissao de jogos', 'futebol'],
  hasVegetarianOptions: ['vegetariano', 'vegetariana'],
  hasVeganOptions: ['vegano', 'vegana'],
};

const STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'a',
  'o',
  'as',
  'os',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'com',
  'para',
  'por',
  'um',
  'uma',
]);

export type VenueSearchFields = {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  musicStyle?: string | null;
  contacts?: unknown;
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function categoryTexts(category: string | null | undefined): string[] {
  if (!category?.trim()) return [];
  const stored = storedCategory(category);
  const texts = [category, stored];
  for (const rule of VENUE_CATEGORY_RENAMES) {
    if (rule.stored === stored) {
      texts.push(rule.display, ...rule.from);
    }
  }
  const extras = CATEGORY_WORDS[stored];
  if (extras) texts.push(...extras);
  return texts;
}

function amenityTexts(contacts: unknown): string[] {
  if (!contacts || typeof contacts !== 'object' || Array.isArray(contacts)) {
    return [];
  }
  const record = contacts as Record<string, unknown>;
  const texts: string[] = [];
  for (const [key, words] of Object.entries(AMENITY_WORDS)) {
    if (record[key] === true) texts.push(...words);
  }
  return texts;
}

function searchBlob(venue: VenueSearchFields): string {
  return normalizeSearchText(
    [
      venue.description ?? '',
      venue.musicStyle ?? '',
      ...categoryTexts(venue.category),
      ...amenityTexts(venue.contacts),
    ].join(' '),
  );
}

/** True when the query words hit category, music style, amenities, or description. */
export function venueMatchesSearchWords(
  venue: VenueSearchFields,
  query: string,
): boolean {
  const term = normalizeSearchText(query);
  if (term.length < 3) return false;
  const blob = searchBlob(venue);
  if (!blob) return false;
  if (blob.includes(term)) return true;
  const tokens = term
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  if (tokens.length < 2) return false;
  return tokens.every((token) => blob.includes(token));
}
