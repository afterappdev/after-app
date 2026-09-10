import 'json_util.dart';

class AdminAccount {
  const AdminAccount({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.state,
    required this.city,
    required this.createdAt,
    this.venueId,
    this.venueName,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String state;
  final String city;
  final DateTime? createdAt;
  final String? venueId;
  final String? venueName;

  String get displayName {
    final venue = venueName?.trim();
    if (role == 'VENUE' && venue != null && venue.isNotEmpty) return venue;
    return name;
  }

  factory AdminAccount.fromJson(Map<String, dynamic> json) {
    return AdminAccount(
      id: asString(json['id']),
      name: asString(json['name']),
      email: asString(json['email']),
      role: asString(json['role']),
      state: asString(json['state']),
      city: asString(json['city']),
      createdAt: asDateTime(json['createdAt']),
      venueId: json['venueId']?.toString(),
      venueName: json['venueName']?.toString(),
    );
  }
}

class AdminVenueSummary {
  const AdminVenueSummary({
    required this.id,
    required this.name,
    required this.city,
    required this.state,
    required this.creditBalance,
    this.description,
    this.category,
    this.logoUrl,
    this.coverUrl,
    this.createdAt,
  });

  final String id;
  final String name;
  final String city;
  final String state;
  final int creditBalance;
  final String? description;
  final String? category;
  final String? logoUrl;
  final String? coverUrl;
  final DateTime? createdAt;

  factory AdminVenueSummary.fromJson(Map<String, dynamic> json) {
    return AdminVenueSummary(
      id: asString(json['id']),
      name: asString(json['name']),
      city: asString(json['city']),
      state: asString(json['state']),
      creditBalance: asInt(json['creditBalance']),
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      logoUrl: json['logoUrl']?.toString(),
      coverUrl: json['coverUrl']?.toString(),
      createdAt: asDateTime(json['createdAt']),
    );
  }
}

class AdminAccountDetail {
  const AdminAccountDetail({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.state,
    required this.city,
    required this.createdAt,
    required this.updatedAt,
    this.avatarUrl,
    this.venue,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String state;
  final String city;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? avatarUrl;
  final AdminVenueSummary? venue;

  factory AdminAccountDetail.fromJson(Map<String, dynamic> json) {
    final venueJson = json['venue'];
    return AdminAccountDetail(
      id: asString(json['id']),
      name: asString(json['name']),
      email: asString(json['email']),
      role: asString(json['role']),
      state: asString(json['state']),
      city: asString(json['city']),
      createdAt: asDateTime(json['createdAt']),
      updatedAt: asDateTime(json['updatedAt']),
      avatarUrl: json['avatarUrl']?.toString(),
      venue: venueJson is Map
          ? AdminVenueSummary.fromJson(Map<String, dynamic>.from(venueJson))
          : null,
    );
  }
}
