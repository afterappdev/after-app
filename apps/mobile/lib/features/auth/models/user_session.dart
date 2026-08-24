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
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String state;
  final String city;
  final String? avatarUrl;
  final String? venueId;

  bool get isVenue => role == 'VENUE';

  factory UserSession.fromJson(Map<String, dynamic> json) {
    return UserSession(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: json['role'] as String,
      state: json['state'] as String,
      city: json['city'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      venueId: json['venueId'] as String?,
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
      };
}
