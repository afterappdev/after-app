import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_coupon.dart';

class CouponsController extends ChangeNotifier {
  CouponsController(this.api);

  final AdminApi api;

  final List<AdminCoupon> items = [];
  int page = 1;
  int totalPages = 1;
  bool loading = false;
  bool loadingMore = false;
  String? error;
  String filter = 'all';

  List<AdminCoupon> get visibleItems {
    return items.where((c) {
      switch (filter) {
        case 'active':
          return c.statusLabel == 'Ativo';
        case 'inactive':
          return c.statusLabel == 'Inativo';
        case 'expired':
          return c.statusLabel == 'Expirado';
        default:
          return true;
      }
    }).toList();
  }

  void setFilter(String value) {
    filter = value;
    notifyListeners();
  }

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
    try {
      final result = await api.coupons(page: refresh ? 1 : page + 1);
      if (refresh) {
        items
          ..clear()
          ..addAll(result.items);
      } else {
        items.addAll(result.items);
      }
      page = result.page;
      totalPages = result.totalPages == 0 ? 1 : result.totalPages;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
      notifyListeners();
    }
  }
}
