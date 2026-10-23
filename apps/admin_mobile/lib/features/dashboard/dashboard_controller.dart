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
  String? loadedYearMonth;

  Future<void> load({bool silent = false, String? yearMonth}) async {
    if (!silent) {
      loading = data == null;
      error = null;
      notifyListeners();
    }
    try {
      data = await api.dashboard(yearMonth: yearMonth);
      loadedYearMonth = data?.month.yearMonth;
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
