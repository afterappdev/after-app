export type VenueAmenityDef = {
  key: string
  label: string
  filterLabel?: string
}

export const VENUE_AMENITIES: VenueAmenityDef[] = [
  { key: 'acceptsMealVoucher', label: 'Vale-refeição', filterLabel: 'Aceita vale-refeição' },
  { key: 'isPetFriendly', label: 'Pet friendly' },
  { key: 'hasKidsSpace', label: 'Espaço kids', filterLabel: 'Tem espaço kids' },
  { key: 'hasWheelchairAccess', label: 'Acessibilidade' },
  { key: 'hasLiveMusic', label: 'Música ao vivo' },
  { key: 'hasBirthdayTreat', label: 'Benefício para aniversariantes' },
  { key: 'hasDelivery', label: 'Delivery' },
  { key: 'hasGlutenFreeFood', label: 'Opções sem glúten' },
  { key: 'hasLactoseFreeFood', label: 'Opções sem lactose' },
  { key: 'hasAirConditioning', label: 'Ambiente climatizado' },
  { key: 'hasBabyChangingRoom', label: 'Fraldário' },
  { key: 'hasOwnParking', label: 'Estacionamento próprio' },
  { key: 'hasWifi', label: 'Wi-Fi' },
  { key: 'acceptsReservations', label: 'Aceita reservas' },
  { key: 'hasOutdoorArea', label: 'Área externa' },
  { key: 'showsSportsBroadcasts', label: 'Transmissão de jogos' },
  { key: 'hasVegetarianOptions', label: 'Opções vegetarianas' },
  { key: 'hasVeganOptions', label: 'Opções veganas' },
]
