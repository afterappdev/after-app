import 'package:after_admin/core/network/api_client.dart';
import 'package:after_admin/core/storage/secure_token_store.dart';
import 'package:after_admin/data/admin_account.dart';
import 'package:after_admin/data/admin_accounts_stats.dart';
import 'package:after_admin/data/admin_city_scope.dart';
import 'package:after_admin/data/admin_sales_summary.dart';
import 'package:after_admin/data/admin_coupon.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_dashboard.dart';
import 'package:after_admin/data/admin_report.dart';
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
    this.saleDetail,
    this.accountDetail,
    this.reportsPage,
    this.reportDetail,
    this.accountsStatsData,
    this.accountsCitiesData,
    this.salesSummaryData,
  });

  Future<AdminLoginResult> Function(String email, String password)?
  loginHandler;
  Future<AdminMe> Function()? meHandler;
  AdminDashboard? dashboardData;
  Paginated<AdminAccount>? accountsPage;
  Paginated<AdminSale>? salesPage;
  AdminSaleDetail? saleDetail;
  AdminAccountDetail? accountDetail;
  Paginated<AdminReport>? reportsPage;
  AdminReportDetail? reportDetail;
  AdminAccountsStats? accountsStatsData;
  AdminCityScopeList? accountsCitiesData;
  AdminSalesSummary? salesSummaryData;
  String? lastAccountsCity;
  String? lastAccountsState;
  String? lastAccountsStatsCity;
  String? lastAccountsStatsState;
  String? deleteAccountError;
  final List<String> deletedAccountIds = [];
  final List<({String token, String platform})> registeredTokens = [];
  final List<String> unregisteredTokens = [];
  final List<String> restoredVenueReportIds = [];
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
  Future<AdminDashboard> dashboard({String? yearMonth}) async {
    return dashboardData!;
  }

  @override
  Future<AdminAccountsStats> accountsStats({String? city, String? state}) async {
    lastAccountsStatsCity = city;
    lastAccountsStatsState = state;
    return accountsStatsData ?? sampleAccountsStats(city: city, state: state);
  }

  @override
  Future<AdminCityScopeList> accountsCities() async {
    return accountsCitiesData ?? sampleCityScopes();
  }

  @override
  Future<Paginated<AdminAccount>> accounts({
    int page = 1,
    int limit = 20,
    String? role,
    String? query,
    String? city,
    String? state,
  }) async {
    lastAccountsCity = city;
    lastAccountsState = state;
    return accountsPage ??
        const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminAccountDetail> account(String id) async {
    if (accountDetail != null) return accountDetail!;
    throw UnimplementedError();
  }

  @override
  Future<void> deleteAccount(String id) async {
    if (deleteAccountError != null) {
      throw ApiException(deleteAccountError!);
    }
    deletedAccountIds.add(id);
    final page = accountsPage;
    if (page != null) {
      final remaining = page.items.where((item) => item.id != id).toList();
      accountsPage = Paginated(
        items: remaining,
        page: page.page,
        limit: page.limit,
        total: remaining.length,
        totalPages: page.totalPages,
      );
    }
  }

  String? lastSalesProvider;
  String? lastSalesStatus;

  @override
  Future<Paginated<AdminSale>> sales({
    int page = 1,
    int limit = 20,
    String? provider,
    String? status,
    String? from,
    String? to,
  }) async {
    lastSalesProvider = provider;
    lastSalesStatus = status;
    return salesPage ??
        const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminSaleDetail> sale(String id) async {
    if (saleDetail != null) return saleDetail!;
    throw UnimplementedError();
  }

  @override
  Future<AdminSalesSummary> salesSummary({
    String? yearMonth,
    String? from,
    String? to,
  }) async {
    return salesSummaryData ?? sampleSalesSummary();
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

  @override
  Future<Paginated<AdminReport>> reports({
    int page = 1,
    int limit = 20,
    String? status,
    String? targetType,
  }) async {
    return reportsPage ??
        const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminReportDetail> report(String id) async {
    if (reportDetail != null) return reportDetail!;
    throw UnimplementedError();
  }

  @override
  Future<AdminReportDetail> moderateReport(
    String id, {
    required String status,
    String? adminNote,
    bool removeContent = false,
  }) async {
      throw UnimplementedError();
  }

  @override
  Future<AdminReportDetail> restoreVenue(String id) async {
    restoredVenueReportIds.add(id);
    final current = reportDetail;
    if (current == null) throw UnimplementedError();
    reportDetail = AdminReportDetail(
      id: current.id,
      targetType: current.targetType,
      targetId: current.targetId,
      reason: current.reason,
      status: current.status,
      createdAt: current.createdAt,
      description: current.description,
      targetSnapshot: current.targetSnapshot,
      moderationAction: current.moderationAction,
      reporterName: current.reporterName,
      reporterId: current.reporterId,
      adminNote: current.adminNote,
      resolvedAt: current.resolvedAt,
      reviewedById: current.reviewedById,
      reviewedByName: current.reviewedByName,
      updatedAt: current.updatedAt,
      contentRestoredAt: DateTime.parse('2026-09-22T16:00:00.000Z'),
      contentRestoredById: 'admin-1',
      contentRestoredByName: 'Admin',
      venueHidden: false,
    );
    return reportDetail!;
  }

  @override
  Future<Paginated<AdminCoupon>> coupons({int page = 1, int limit = 20}) async {
    return const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0);
  }

  @override
  Future<AdminCouponDetail> coupon(String id) {
    throw UnimplementedError();
  }

  @override
  Future<AdminCoupon> createCoupon({
    required String code,
    required int creditAmount,
    AdminCouponCreditKind creditKind = AdminCouponCreditKind.common,
    bool active = true,
    String? startsAt,
    String? expiresAt,
    int? maxRedemptions,
    int maxRedemptionsPerVenue = 1,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<AdminCoupon> updateCoupon(
    String id, {
    bool? active,
    String? startsAt,
    String? expiresAt,
    int? maxRedemptions,
    int? maxRedemptionsPerVenue,
  }) {
    throw UnimplementedError();
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
  RefundPosition? refundPosition,
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
    refundPosition:
        refundPosition ??
        RefundPosition(
          yearMonth: '2026-09',
          paidSalesBrl: gross,
          fullRefundsBrl: 0,
          partialRefundsBrl: 0,
          partialsWithoutAmount: 0,
          revenueAfterRefundsBrl: gross,
          revenueComplete: true,
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
    insights: AdminDashboardInsights(
      topCitiesNewAccounts: const [
        RankedCity(city: 'São Paulo', state: 'SP', count: 12),
      ],
      topVenueCategories: const [
        RankedCategory(category: 'Bar', count: 5),
      ],
      reportsCreated: 3,
    ),
  );
}

AdminCityScopeList sampleCityScopes() {
  return const AdminCityScopeList(
    items: [
      AdminCityScope(city: 'São Paulo', state: 'SP', accountCount: 10),
      AdminCityScope(city: 'São Paulo', state: 'MG', accountCount: 2),
    ],
  );
}

AdminAccountsStats sampleAccountsStats({String? city, String? state}) {
  final scoped = city != null && state != null;
  return AdminAccountsStats(
    totals: const AdminAccountsTotals(users: 986, venues: 298, accounts: 1284),
    usersByAgeBand: scoped
        ? const [CountBucket(key: 'AGE_19_35', count: 3)]
        : const [
            CountBucket(key: 'AGE_19_35', count: 400),
            CountBucket(key: 'UNKNOWN', count: 50),
          ],
    venuesByCategory: scoped
        ? const [CountBucket(key: 'Bar', count: 1)]
        : const [CountBucket(key: 'Bar', count: 120)],
    cityScope: scoped
        ? AdminAccountsCityScope(
            city: city,
            state: state,
            users: 3,
            venues: 1,
            usersByAgeBand: const [CountBucket(key: 'AGE_19_35', count: 3)],
            venuesByCategory: const [CountBucket(key: 'Bar', count: 1)],
          )
        : null,
  );
}

AdminSalesSummary sampleSalesSummary() {
  return AdminSalesSummary(
    yearMonth: '2026-09',
    paidPurchases: 83,
    creditsSold: 347,
    grossRevenueBrl: 7825,
    revenueByProvider: const ProviderRevenue(
      googlePlay: 2000,
      appStore: 1500,
      pix: 4325,
    ),
    commonCredits: 300,
    vipCredits: 47,
    packages: const SalesPackageCounts(unit1: 10, combo5: 20, combo10: 5),
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
  'refundPosition': {
    'yearMonth': '2026-09',
    'paidSalesBrl': 340,
    'fullRefundsBrl': 34.9,
    'partialRefundsBrl': 10.1,
    'partialsWithoutAmount': 1,
    'revenueAfterRefundsBrl': 329.9,
    'revenueComplete': false,
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
  'insights': {
    'topCitiesNewAccounts': [
      {'city': 'Curitiba', 'state': 'PR', 'count': 4},
    ],
    'topVenueCategories': [
      {'category': 'Restaurante', 'count': 2},
    ],
    'reportsCreated': 7,
  },
};
