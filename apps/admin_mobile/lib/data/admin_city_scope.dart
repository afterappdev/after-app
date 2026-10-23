import 'json_util.dart';

/// City + UF pair for admin account filters (homonymous cities differ by state).
class AdminCityScope {
  const AdminCityScope({
    required this.city,
    required this.state,
    this.accountCount,
  });

  final String city;
  final String state;
  final int? accountCount;

  String get label => '$city, $state';

  /// Stable dropdown value (city and state may contain commas in theory).
  String get key => '$city\u001f$state';

  bool matches(AdminCityScope? other) {
    if (other == null) return false;
    return other.city == city && other.state == state;
  }

  factory AdminCityScope.fromJson(Map<String, dynamic> json) {
    return AdminCityScope(
      city: asString(json['city']),
      state: asString(json['state']),
      accountCount: json['accountCount'] == null
          ? null
          : asInt(json['accountCount']),
    );
  }

  static AdminCityScope? fromKey(String? key) {
    if (key == null || key.isEmpty) return null;
    final parts = key.split('\u001f');
    if (parts.length != 2) return null;
    return AdminCityScope(city: parts[0], state: parts[1]);
  }
}

class AdminCityScopeList {
  const AdminCityScopeList({required this.items});

  final List<AdminCityScope> items;

  factory AdminCityScopeList.fromJson(Map<String, dynamic> json) {
    final raw = json['items'];
    if (raw is! List) return const AdminCityScopeList(items: []);
    return AdminCityScopeList(
      items: raw
          .whereType<Map>()
          .map((e) => AdminCityScope.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}
