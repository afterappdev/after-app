import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../data/admin_account.dart';
import '../../data/admin_accounts_stats.dart';
import '../../data/admin_api.dart';
import '../../data/admin_city_scope.dart';

class AccountsController extends ChangeNotifier {
  AccountsController(this.api);

  final AdminApi api;

  final List<AdminAccount> items = [];
  String query = '';
  String? role = 'USER';
  int totalUsers = 0;
  int totalVenues = 0;
  AdminCityScope? selectedCity;
  List<AdminCityScope> cityOptions = [];
  bool loadingCities = false;
  int page = 1;
  int totalPages = 1;
  bool loading = false;
  bool loadingMore = false;
  bool loadingStats = false;
  String? error;
  AdminAccountsStats? stats;

  Timer? _debounce;

  Future<void> loadCityOptions() async {
    loadingCities = true;
    notifyListeners();
    try {
      final list = await api.accountsCities();
      cityOptions = list.items;
      if (selectedCity != null &&
          !cityOptions.any((c) => c.matches(selectedCity))) {
        selectedCity = null;
      }
    } on ApiException {
      // keep previous options
    } finally {
      loadingCities = false;
      notifyListeners();
    }
  }

  Future<void> loadStats() async {
    loadingStats = true;
    notifyListeners();
    try {
      stats = await api.accountsStats(
        city: selectedCity?.city,
        state: selectedCity?.state,
      );
      totalUsers = stats!.totals.users;
      totalVenues = stats!.totals.venues;
    } on ApiException {
      // keep previous totals/stats
    } finally {
      loadingStats = false;
      notifyListeners();
    }
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
      final result = await api.accounts(
        page: refresh ? 1 : page + 1,
        role: role,
        query: query,
        city: selectedCity?.city,
        state: selectedCity?.state,
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
    if (refresh && error == null) {
      await loadStats();
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

  void setRoleTab(String value) {
    role = value;
    load();
  }

  Future<void> setCityScope(AdminCityScope? scope) async {
    selectedCity = scope;
    await load();
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
