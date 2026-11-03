class OwnedVenueSummary {
  const OwnedVenueSummary({
    required this.id,
    required this.name,
    required this.city,
    required this.state,
    this.logoUrl,
    this.category,
    this.createdAt,
  });

  final String id;
  final String name;
  final String city;
  final String state;
  final String? logoUrl;
  final String? category;
  final DateTime? createdAt;

  factory OwnedVenueSummary.fromJson(Map<String, dynamic> json) {
    DateTime? created;
    final rawCreated = json['createdAt'];
    if (rawCreated is String && rawCreated.isNotEmpty) {
      created = DateTime.tryParse(rawCreated);
    }
    return OwnedVenueSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      city: json['city'] as String,
      state: json['state'] as String,
      logoUrl: json['logoUrl'] as String?,
      category: json['category'] as String?,
      createdAt: created,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'city': city,
        'state': state,
        'logoUrl': logoUrl,
        if (category != null) 'category': category,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      };
}
