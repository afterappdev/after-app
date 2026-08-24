import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class RecentCitiesStorage {
  RecentCitiesStorage({this.userId});

  final String? userId;

  static const _max = 8;

  String get _key {
    final id = userId?.trim() ?? '';
    return id.isEmpty ? 'recent_cities' : 'recent_cities_$id';
  }

  Future<List<Map<String, dynamic>>> read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((c) => (c['name']?.toString() ?? '').trim().isNotEmpty)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> remember(String name, String uf) async {
    final city = name.trim();
    if (city.isEmpty) return read();
    final nextUf = uf.trim();
    final items = await read();
    items.removeWhere(_isSameCity(city, nextUf));
    items.insert(0, {'name': city, 'uf': nextUf});
    if (items.length > _max) {
      items.removeRange(_max, items.length);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(items));
    return items;
  }

  static bool Function(Map<String, dynamic>) _isSameCity(
    String name,
    String uf,
  ) {
    return (c) =>
        (c['name']?.toString() ?? '').trim().toLowerCase() ==
            name.toLowerCase() &&
        (c['uf']?.toString() ?? '').trim().toLowerCase() == uf.toLowerCase();
  }
}
