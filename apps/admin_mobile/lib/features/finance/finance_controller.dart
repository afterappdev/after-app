import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_finance.dart';

class FinanceController extends ChangeNotifier {
  FinanceController(this.api) {
    monthOptions = _buildMonthOptions(24);
    yearMonth = monthOptions.first;
  }

  static const int listPageSize = 8;

  final AdminApi api;

  late final List<String> monthOptions;
  late String yearMonth;
  final List<AdminFinanceMovement> items = [];
  AdminFinanceOverview? overview;
  int page = 1;
  int totalPages = 1;
  int totalItems = 0;
  int pageLimit = listPageSize;
  bool loading = false;
  bool loadingOverview = false;
  String? error;

  Future<void> load({bool refresh = true, int? targetPage}) async {
    final pageToLoad = targetPage ?? (refresh ? 1 : page);
    if (refresh && targetPage == null) {
      page = 1;
      loading = items.isEmpty;
      error = null;
      notifyListeners();
    } else {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final result = await api.financeMovements(
        yearMonth: yearMonth,
        page: pageToLoad,
        limit: listPageSize,
      );
      items
        ..clear()
        ..addAll(result.items);
      page = result.page;
      totalPages = result.totalPages == 0 ? 1 : result.totalPages;
      totalItems = result.total;
      pageLimit = result.limit;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
    if (error == null) {
      await _loadOverview();
    }
  }

  Future<void> _loadOverview() async {
    loadingOverview = true;
    notifyListeners();
    try {
      overview = await api.financeOverview(yearMonth: yearMonth);
    } catch (_) {
      overview = null;
    } finally {
      loadingOverview = false;
      notifyListeners();
    }
  }

  Future<void> goToPage(int targetPage) async {
    if (targetPage < 1 || targetPage > totalPages || targetPage == page) return;
    await load(refresh: false, targetPage: targetPage);
  }

  void setYearMonth(String value) {
    if (yearMonth == value) return;
    yearMonth = value;
    load();
  }

  Future<void> refreshAll() => load();

  List<String> _buildMonthOptions(int count) {
    final now = DateTime.now();
    final options = <String>[];
    var cursor = DateTime(now.year, now.month);
    for (var i = 0; i < count; i++) {
      options.add(
        '${cursor.year.toString().padLeft(4, '0')}-${cursor.month.toString().padLeft(2, '0')}',
      );
      cursor = DateTime(cursor.year, cursor.month - 1);
    }
    return options;
  }
}
