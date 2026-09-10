import 'package:after_admin/core/storage/secure_token_store.dart';
import 'package:after_admin/data/admin_account.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_dashboard.dart';
import 'package:after_admin/data/admin_sale.dart';
import 'package:after_admin/data/admin_session.dart';
import 'package:after_admin/data/paginated.dart';

class MemoryTokenStore implements TokenStore {
  String? token;

  @override
  Future<void> saveToken(String value) async => token = value;

  @override
  Future<String?> readToken() async => token;

  @override
  Future<void> clear() async => token = null;
}

class FakeAdminApi implements AdminApi {
  FakeAdminApi({
    this.loginHandler,
    this.meHandler,
    this.dashboardData,
    this.accountsPage,
    this.salesPage,
  });

  Future<AdminLoginResult> Function(String email, String password)?
  loginHandler;
  Future<AdminMe> Function()? meHandler;
  AdminDashboard? dashboardData;
  Paginated<AdminAccount>? accountsPage;
  Paginated<AdminSale>? salesPage;
  final List<({String token, String platform})> registeredTokens = [];
  final List<String> unregisteredTokens = [];
  bool failUnregister = false;

  @override
  Future<AdminLoginResult> login({
    required String email,
    required String password,
  }) {
    return loginHandler!(email, password);
  }

  @override
  Future<AdminMe> me() => meHandler!();

  @override
  Future<AdminDashboard> dashboard() async {
    return dashboardData!;
  }

  @override
  Future<Paginated<AdminAccount>> accounts({
    int page = 1,
    int limit = 20,
    String? role,
    String? query,
  }) async {
    return accountsPage ??
        const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminAccountDetail> account(String id) {
    throw UnimplementedError();
  }

  @override
  Future<Paginated<AdminSale>> sales({
    int page = 1,
    int limit = 20,
    String? provider,
    String? from,
    String? to,
  }) async {
    return salesPage ??
        const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminSaleDetail> sale(String id) {
    throw UnimplementedError();
  }

  @override
  Future<void> registerPushToken({
    required String token,
    required String platform,
  }) async {
    registeredTokens.add((token: token, platform: platform));
  }

  @override
  Future<void> unregisterPushToken(String token) async {
    if (failUnregister) {
      throw Exception('network');
    }
    unregisteredTokens.add(token);
  }
}

AdminDashboard sampleDashboard({
  int accounts = 1284,
  int users = 986,
  int venues = 298,
  int newAccounts = 42,
  int paidPurchases = 83,
  int creditsSold = 347,
  double gross = 7825,
  double play = 2000,
  double apple = 1500,
  double pix = 4325,
}) {
  return AdminDashboard(
    totals: AdminDashboardTotals(
      accounts: accounts,
      users: users,
      venues: venues,
    ),
    month: AdminDashboardMonth(
      yearMonth: '2026-09',
      newAccounts: newAccounts,
      paidPurchases: paidPurchases,
      creditsSold: creditsSold,
      grossRevenueBrl: gross,
      revenueByProvider: ProviderRevenue(
        googlePlay: play,
        appStore: apple,
        pix: pix,
      ),
    ),
    history: [
      for (var i = 10; i >= 0; i--)
        MonthlySales(
          yearMonth: '2025-${(i + 1).toString().padLeft(2, '0')}',
          purchases: 0,
          credits: 0,
          grossRevenueBrl: 0,
          byProvider: ProviderRevenue.zero,
        ),
      MonthlySales(
        yearMonth: '2026-09',
        purchases: paidPurchases,
        credits: creditsSold,
        grossRevenueBrl: gross,
        byProvider: ProviderRevenue(
          googlePlay: play,
          appStore: apple,
          pix: pix,
        ),
      ),
    ],
    recentAccounts: const [],
    recentSales: const [],
    warnings: const [],
  );
}

const sampleDashboardJson = {
  'totals': {'accounts': 3, 'users': 2, 'venues': 1},
  'month': {
    'yearMonth': '2026-09',
    'newAccounts': 2,
    'paidPurchases': 3,
    'creditsSold': 16,
    'grossRevenueBrl': 340,
    'revenueByProvider': {'google_play': 25, 'app_store': 200, 'pix': 115},
  },
  'history': [
    {
      'yearMonth': '2026-08',
      'purchases': 1,
      'credits': 1,
      'grossRevenueBrl': 25,
      'byProvider': {'google_play': 0, 'app_store': 0, 'pix': 25},
    },
  ],
  'recentAccounts': [
    {
      'id': 'u1',
      'name': 'Ana',
      'email': 'ana@after.local',
      'role': 'USER',
      'createdAt': '2026-09-01T12:00:00.000Z',
    },
    {
      'id': 'u2',
      'name': 'Bar Central',
      'email': 'bar@after.local',
      'role': 'VENUE',
      'createdAt': '2026-09-02T12:00:00.000Z',
      'venueId': 'v1',
      'venueName': 'Bar Central',
    },
  ],
  'recentSales': [
    {
      'id': 's1',
      'packageKey': 'combo_5',
      'credits': 5,
      'amountPaid': 115,
      'currency': 'BRL',
      'provider': 'pix',
      'confirmedAt': '2026-09-03T11:14:00.000Z',
      'venueId': 'v1',
      'venueName': 'Bar Central',
    },
  ],
  'warnings': [],
};
