const RENAMES: Record<string, string> = {
  '☕ Cafeterias e Docerias': '☕ Cafeterias e Padarias',
  'Cafeterias e Docerias': '☕ Cafeterias e Padarias',
  '🍣 Culinária Internacional': '🍣 Culinária Asiática',
  'Culinária Internacional': '🍣 Culinária Asiática',
  '🎯 Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
  'Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
  '🎯 Jogos, Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
  'Jogos, Lazer e Diversão': '⚽ Esportes, Lazer e Jogos',
  '🍔 Hamburguerias': '🍔 Hamburguerias e Lanchonetes',
  Hamburguerias: '🍔 Hamburguerias e Lanchonetes',
  '🎡 Food Park': '🍴 Food Park',
  'Food Park': '🍴 Food Park',
  '🎶 Karaokê': '🎤 Karaokê',
  Karaokê: '🎤 Karaokê',
  '🍨 Sorveterias e Açaí': '🍦 Sorveterias e Açaí',
  'Sorveterias e Açaí': '🍦 Sorveterias e Açaí',
}

const CATALOG = [
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
]

function labelName(value: string): string {
  const trimmed = value.trim()
  const space = trimmed.indexOf(' ')
  if (space < 0) return trimmed
  return trimmed.slice(space + 1)
}

export const VENUE_CATEGORIES: string[] = [...CATALOG].sort((a, b) =>
  labelName(a).localeCompare(labelName(b), 'pt-BR'),
)

export function presentVenueCategory(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const trimmed = value.trim()
  return RENAMES[trimmed] ?? trimmed
}
