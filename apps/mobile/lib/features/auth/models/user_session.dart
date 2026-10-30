import 'owned_venue_summary.dart';

class UserSession {
  UserSession({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.state,
    required this.city,
    this.avatarUrl,
    this.venueId,
    this.activeVenueId,
    this.venues = const [],
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String state;
  final String city;
  final String? avatarUrl;
  /// Legado: estabelecimento mais antigo (API `venueId`).
  final String? venueId;
  /// Seleção persistida na conta (`activeVenueId`); pode ser null.
  final String? activeVenueId;
  final List<OwnedVenueSummary> venues;

  bool get isVenue => role == 'VENUE';

  /// Venue usado nas rotas implícitas até existir seletor (3B).
  /// Preferência: ativo → legado → primeiro da lista.
  String? get implicitVenueHeaderId =>
      _nonEmpty(activeVenueId) ??
      _nonEmpty(venueId) ??
      (venues.isNotEmpty ? venues.first.id : null);

  static String? _nonEmpty(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    return trimmed;
  }

  factory UserSession.fromJson(Map<String, dynamic> json) {
    final venue = json['venue'];
    final nestedId = venue is Map<String, dynamic> ? venue['id'] as String? : null;
    final venuesRaw = json['venues'];
    final venues = venuesRaw is List
        ? [
            for (final item in venuesRaw)
              if (item is Map<String, dynamic>)
                OwnedVenueSummary.fromJson(item),
          ]
        : const <OwnedVenueSummary>[];
    return UserSession(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: json['role'] as String,
      state: json['state'] as String,
      city: json['city'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      venueId: json['venueId'] as String? ?? nestedId,
      activeVenueId: json['activeVenueId'] as String?,
      venues: venues,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'state': state,
        'city': city,
        'avatarUrl': avatarUrl,
        'venueId': venueId,
        'activeVenueId': activeVenueId,
        'venues': [for (final v in venues) v.toJson()],
      };

  UserSession copyWith({
    String? id,
    String? name,
    String? email,
    String? role,
    String? state,
    String? city,
    String? avatarUrl,
    String? venueId,
    String? activeVenueId,
    List<OwnedVenueSummary>? venues,
  }) {
    return UserSession(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      role: role ?? this.role,
      state: state ?? this.state,
      city: city ?? this.city,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      venueId: venueId ?? this.venueId,
      activeVenueId: activeVenueId ?? this.activeVenueId,
      venues: venues ?? this.venues,
    );
  }

  /// Campos retornados por `buildVenueAuthFields` (login / PUT active-venue).
  UserSession mergeVenueAuthFields(Map<String, dynamic> fields) {
    final venuesRaw = fields['venues'];
    final parsedVenues = venuesRaw is List
        ? [
            for (final item in venuesRaw)
              if (item is Map<String, dynamic>)
                OwnedVenueSummary.fromJson(item),
          ]
        : null;
    return copyWith(
      venueId: fields['venueId'] as String? ?? venueId,
      activeVenueId: fields.containsKey('activeVenueId')
          ? fields['activeVenueId'] as String?
          : activeVenueId,
      venues: parsedVenues ?? venues,
    );
  }
}
