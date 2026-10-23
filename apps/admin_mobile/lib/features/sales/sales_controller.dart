import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_dashboard.dart';
import '../../data/admin_sale.dart';

class SalesMonthMetrics {
  const SalesMonthMetrics({
    required this.yearMonth,
    required this.revenue,
    required this.creditsSold,
    required this.paidPurchases,
    required this.commonCredits,
    required this.vipCredits,
    required this.purchasesUnit1,
    required this.purchasesCombo5,
    required this.purchasesCombo10,
  });

  final String yearMonth;
  final ProviderRevenue revenue;
  final int creditsSold;
  final int paidPurchases;
  final int commonCredits;
  final int vipCredits;
  final int purchasesUnit1;
  final int purchasesCombo5;
  final int purchasesCombo10;
}

class SalesController extends ChangeNotifier {
  SalesController(this.api);

  final AdminApi api;

  final List<AdminSale> items = [];
  String? provider;
  String? status;
  String period = 'month';
  int page = 1;
  int totalPages = 1;
  bool loading = false;
  bool loadingMore = false;
  bool loadingMetrics = false;
  String? error;
  SalesMonthMetrics? monthMetrics;

  bool get _metricsEligible =>
      period == 'month' && provider == null && status == null;

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
        status: status,
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
    if (refresh && error == null) {
      await _loadMonthMetrics();
    }
  }

  Future<void> _loadMonthMetrics() async {
    if (!_metricsEligible) {
      if (monthMetrics != null) {
        monthMetrics = null;
        notifyListeners();
      }
      return;
    }
    loadingMetrics = true;
    notifyListeners();
    try {
      final dash = await api.dashboard();
      final range = _range();
      var commonCredits = 0;
      var vipCredits = 0;
      var unit1 = 0;
      var combo5 = 0;
      var combo10 = 0;
      var p = 1;
      while (true) {
        final batch = await api.sales(
          page: p,
          limit: 100,
          from: range.$1,
          to: range.$2,
          status: 'paid',
        );
        for (final sale in batch.items) {
          final key = sale.packageKey.toLowerCase();
          final vip = key.startsWith('vip') || key.contains('vip_');
          if (vip) {
            vipCredits += sale.credits;
          } else {
            commonCredits += sale.credits;
          }
          switch (key) {
            case 'unit_1':
              unit1 += 1;
            case 'combo_5':
              combo5 += 1;
            case 'combo_10':
              combo10 += 1;
            default:
              break;
          }
        }
        if (p >= batch.totalPages) break;
        p += 1;
      }
      monthMetrics = SalesMonthMetrics(
        yearMonth: dash.month.yearMonth,
        revenue: dash.month.revenueByProvider,
        creditsSold: dash.month.creditsSold,
        paidPurchases: dash.month.paidPurchases,
        commonCredits: commonCredits,
        vipCredits: vipCredits,
        purchasesUnit1: unit1,
        purchasesCombo5: combo5,
        purchasesCombo10: combo10,
      );
    } catch (_) {
      monthMetrics = null;
    } finally {
      loadingMetrics = false;
      notifyListeners();
    }
  }

  void setProvider(String? value) {
    provider = value;
    load();
  }

  void setStatus(String? value) {
    status = value;
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
