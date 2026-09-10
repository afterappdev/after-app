import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_sale.dart';

class SalesController extends ChangeNotifier {
  SalesController(this.api);

  final AdminApi api;

  final List<AdminSale> items = [];
  String? provider;
  String period = 'all';
  int page = 1;
  int totalPages = 1;
  bool loading = false;
  bool loadingMore = false;
  String? error;

  Future<void> load({bool refresh = true}) async {
    if (refresh) {
      page = 1;
      loading = items.isEmpty;
      error = null;
      notifyListeners();
    } else {
      if (loadingMore || page >= totalPages) return;
      loadingMore = true;
      notifyListeners();
    }
    final range = _range();
    try {
      final result = await api.sales(
        page: refresh ? 1 : page + 1,
        provider: provider,
        from: range.$1,
        to: range.$2,
      );
      if (refresh) {
        items
          ..clear()
          ..addAll(result.items);
      } else {
        items.addAll(result.items);
      }
      page = result.page;
      totalPages = result.totalPages;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
      notifyListeners();
    }
  }

  void setProvider(String? value) {
    provider = value;
    load();
  }

  void setPeriod(String value) {
    period = value;
    load();
  }

  (String?, String?) _range() {
    final now = DateTime.now();
    String ymd(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    if (period == 'month') {
      final start = DateTime(now.year, now.month, 1);
      return (ymd(start), ymd(now));
    }
    if (period == '30d') {
      final start = now.subtract(const Duration(days: 29));
      return (ymd(start), ymd(now));
    }
    return (null, null);
  }
}
