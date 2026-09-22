import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_report.dart';

class ReportsController extends ChangeNotifier {
  ReportsController(this.api);

  final AdminApi api;

  final List<AdminReport> items = [];
  String? status = 'PENDING';
  String? targetType;
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
    try {
      final result = await api.reports(
        page: refresh ? 1 : page + 1,
        status: status,
        targetType: targetType,
      );
      if (refresh) {
        items
          ..clear()
          ..addAll(result.items);
        page = result.page;
      } else {
        items.addAll(result.items);
        page = result.page;
      }
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

  void setStatus(String? value) {
    status = value;
    load();
  }

  void setTargetType(String? value) {
    targetType = value;
    load();
  }

  Future<void> reportUpdated(AdminReportDetail detail) async {
    final index = items.indexWhere((item) => item.id == detail.id);
    if (index >= 0) {
      items[index] = detail;
      notifyListeners();
    }
    await load();
  }
}
