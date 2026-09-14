import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_account.dart';
import '../../data/admin_api.dart';

class AccountsController extends ChangeNotifier {
  AccountsController(this.api);

  final AdminApi api;

  final List<AdminAccount> items = [];
  String query = '';
  String? role;
  int page = 1;
  int totalPages = 1;
  bool loading = false;
  bool loadingMore = false;
  String? error;

  Timer? _debounce;

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
      final result = await api.accounts(
        page: refresh ? 1 : page + 1,
        role: role,
        query: query,
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

  Future<void> accountDeleted(String id) async {
    items.removeWhere((account) => account.id == id);
    notifyListeners();
    await load();
  }

  void setRole(String? value) {
    role = value;
    load();
  }

  void setQuery(String value) {
    query = value;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), load);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}
