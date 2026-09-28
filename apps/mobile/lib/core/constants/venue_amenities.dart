import 'package:flutter/material.dart';

class VenueAmenity {
  const VenueAmenity({
    required this.key,
    required this.label,
    required this.icon,
    String? filterLabel,
  }) : filterLabel = filterLabel ?? label;

  final String key;
  final String label;
  final String filterLabel;
  final IconData icon;
}

class VenueAmenities {
  static const all = <VenueAmenity>[
    VenueAmenity(
      key: 'acceptsMealVoucher',
      label: 'Vale-refeição',
      filterLabel: 'Aceita vale-refeição',
      icon: Icons.confirmation_number_outlined,
    ),
    VenueAmenity(
      key: 'isPetFriendly',
      label: 'Pet friendly',
      icon: Icons.pets_outlined,
    ),
    VenueAmenity(
      key: 'hasKidsSpace',
      label: 'Espaço kids',
      filterLabel: 'Tem espaço kids',
      icon: Icons.child_care_outlined,
    ),
    VenueAmenity(
      key: 'hasWheelchairAccess',
      label: 'Acessibilidade',
      icon: Icons.accessible,
    ),
    VenueAmenity(
      key: 'hasLiveMusic',
      label: 'Música ao vivo',
      icon: Icons.music_note_outlined,
    ),
    VenueAmenity(
      key: 'hasBirthdayTreat',
      label: 'Benefício para aniversariantes',
      icon: Icons.cake_outlined,
    ),
    VenueAmenity(
      key: 'hasDelivery',
      label: 'Delivery',
      icon: Icons.delivery_dining_outlined,
    ),
    VenueAmenity(
      key: 'hasGlutenFreeFood',
      label: 'Opções sem glúten',
      icon: Icons.bakery_dining_outlined,
    ),
    VenueAmenity(
      key: 'hasLactoseFreeFood',
      label: 'Opções sem lactose',
      icon: Icons.local_drink_outlined,
    ),
    VenueAmenity(
      key: 'hasAirConditioning',
      label: 'Ambiente climatizado',
      icon: Icons.ac_unit_outlined,
    ),
    VenueAmenity(
      key: 'hasBabyChangingRoom',
      label: 'Fraldário',
      icon: Icons.baby_changing_station,
    ),
    VenueAmenity(
      key: 'hasOwnParking',
      label: 'Estacionamento próprio',
      icon: Icons.local_parking_outlined,
    ),
    VenueAmenity(
      key: 'hasWifi',
      label: 'Wi-Fi',
      icon: Icons.wifi,
    ),
    VenueAmenity(
      key: 'acceptsReservations',
      label: 'Aceita reservas',
      icon: Icons.event_available_outlined,
    ),
    VenueAmenity(
      key: 'hasOutdoorArea',
      label: 'Área externa',
      icon: Icons.deck_outlined,
    ),
    VenueAmenity(
      key: 'showsSportsBroadcasts',
      label: 'Transmissão de jogos',
      icon: Icons.sports_soccer_outlined,
    ),
    VenueAmenity(
      key: 'hasVegetarianOptions',
      label: 'Opções vegetarianas',
      icon: Icons.eco_outlined,
    ),
    VenueAmenity(
      key: 'hasVeganOptions',
      label: 'Opções veganas',
      icon: Icons.spa_outlined,
    ),
  ];

  static List<VenueAmenity> owned(Map<String, dynamic> contacts) {
    return all.where((item) => contacts[item.key] == true).toList();
  }
}

String formatVenueEntry({
  required bool hasCoverCharge,
  required String coverCharge,
}) {
  if (!hasCoverCharge) return 'Entrada gratuita';
  final raw = coverCharge.trim();
  if (raw.isEmpty) return 'Entrada paga';
  final value = raw.toLowerCase().startsWith('r\$') ? raw : 'R\$ $raw';
  return 'Entrada: $value';
}
