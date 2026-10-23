import 'json_util.dart';

class CountBucket {
  const CountBucket({required this.key, required this.count});

  final String key;
  final int count;

  factory CountBucket.fromJson(Map<String, dynamic> json) {
    return CountBucket(
      key: asString(json['key']),
      count: asInt(json['count']),
    );
  }
}

class AdminAccountsTotals {
  const AdminAccountsTotals({
    required this.users,
    required this.venues,
    required this.accounts,
  });

  final int users;
  final int venues;
  final int accounts;

  factory AdminAccountsTotals.fromJson(Map<String, dynamic> json) {
    return AdminAccountsTotals(
      users: asInt(json['users']),
      venues: asInt(json['venues']),
      accounts: asInt(json['accounts']),
    );
  }
}

class AdminAccountsCityScope {
  const AdminAccountsCityScope({
    required this.city,
    required this.state,
    required this.users,
    required this.venues,
    required this.usersByAgeBand,
    required this.venuesByCategory,
  });

  final String city;
  final String state;
  final int users;
  final int venues;
  final List<CountBucket> usersByAgeBand;
  final List<CountBucket> venuesByCategory;

  factory AdminAccountsCityScope.fromJson(Map<String, dynamic> json) {
    return AdminAccountsCityScope(
      city: asString(json['city']),
      state: asString(json['state']),
      users: asInt(json['users']),
      venues: asInt(json['venues']),
      usersByAgeBand: _list(json['usersByAgeBand']),
      venuesByCategory: _list(json['venuesByCategory']),
    );
  }

  static List<CountBucket> _list(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => CountBucket.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

class AdminAccountsStats {
  const AdminAccountsStats({
    required this.totals,
    required this.usersByAgeBand,
    required this.venuesByCategory,
    this.cityScope,
  });

  final AdminAccountsTotals totals;
  final List<CountBucket> usersByAgeBand;
  final List<CountBucket> venuesByCategory;
  final AdminAccountsCityScope? cityScope;

  factory AdminAccountsStats.fromJson(Map<String, dynamic> json) {
    final scope = json['cityScope'];
    return AdminAccountsStats(
      totals: AdminAccountsTotals.fromJson(asMap(json['totals'])),
      usersByAgeBand: AdminAccountsCityScope._list(json['usersByAgeBand']),
      venuesByCategory: AdminAccountsCityScope._list(json['venuesByCategory']),
      cityScope: scope is Map
          ? AdminAccountsCityScope.fromJson(Map<String, dynamic>.from(scope))
          : null,
    );
  }
}
