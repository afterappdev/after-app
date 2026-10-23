import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_api.dart';
import '../../data/admin_dashboard.dart';

class DashboardController extends ChangeNotifier {
  DashboardController(this.api);

  final AdminApi api;

  AdminDashboard? data;
  String? error;
  bool loading = false;

  /// Denúncias pendentes (total global; API não filtra por mês).
  int? reportsPendingTotal;

  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading = data == null;
      error = null;
      notifyListeners();
    }
    try {
      final results = await Future.wait([
        api.dashboard(),
        _fetchReportsPending(),
      ]);
      data = results[0] as AdminDashboard;
      reportsPendingTotal = results[1] as int?;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<int?> _fetchReportsPending() async {
    try {
      final page = await api.reports(status: 'PENDING', limit: 1);
      return page.total;
    } on ApiException {
      return null;
    }
  }
}
