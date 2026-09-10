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

  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading = data == null;
      error = null;
      notifyListeners();
    }
    try {
      data = await api.dashboard();
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
