class Paginated<T> {
  const Paginated({
    required this.items,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final List<T> items;
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  bool get hasMore => page < totalPages;

  factory Paginated.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic> item) parseItem,
  ) {
    final rawItems = json['items'];
    final items = <T>[];
    if (rawItems is List) {
      for (final item in rawItems) {
        if (item is Map) {
          items.add(parseItem(Map<String, dynamic>.from(item)));
        }
      }
    }
    return Paginated<T>(
      items: items,
      page: _int(json['page'], 1),
      limit: _int(json['limit'], 20),
      total: _int(json['total'], 0),
      totalPages: _int(json['totalPages'], 0),
    );
  }

  static int _int(Object? value, int fallback) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse('$value') ?? fallback;
  }
}
