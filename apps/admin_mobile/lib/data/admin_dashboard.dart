import 'json_util.dart';

class ProviderRevenue {
  const ProviderRevenue({
    required this.googlePlay,
    required this.appStore,
    required this.pix,
    this.card = 0,
  });

  final double googlePlay;
  final double appStore;
  final double pix;
  final double card;

  factory ProviderRevenue.fromJson(Map<String, dynamic> json) {
    return ProviderRevenue(
      googlePlay: asMoney(json['google_play']),
      appStore: asMoney(json['app_store']),
      pix: asMoney(json['pix']),
      card: asMoney(json['card']),
    );
  }

  static const zero = ProviderRevenue(googlePlay: 0, appStore: 0, pix: 0);
}

class AdminDashboardTotals {
  const AdminDashboardTotals({
    required this.accounts,
    required this.users,
    required this.venues,
  });

  final int accounts;
  final int users;
  final int venues;

  factory AdminDashboardTotals.fromJson(Map<String, dynamic> json) {
    return AdminDashboardTotals(
      accounts: asInt(json['accounts']),
      users: asInt(json['users']),
      venues: asInt(json['venues']),
    );
  }
}

class AdminDashboardMonth {
  const AdminDashboardMonth({
    required this.yearMonth,
    required this.newAccounts,
    required this.paidPurchases,
    required this.creditsSold,
    required this.grossRevenueBrl,
    required this.revenueByProvider,
  });

  final String yearMonth;
  final int newAccounts;
  final int paidPurchases;
  final int creditsSold;
  final double grossRevenueBrl;
  final ProviderRevenue revenueByProvider;

  factory AdminDashboardMonth.fromJson(Map<String, dynamic> json) {
    return AdminDashboardMonth(
      yearMonth: asString(json['yearMonth']),
      newAccounts: asInt(json['newAccounts']),
      paidPurchases: asInt(json['paidPurchases']),
      creditsSold: asInt(json['creditsSold']),
      grossRevenueBrl: asMoney(json['grossRevenueBrl']),
      revenueByProvider: ProviderRevenue.fromJson(
        asMap(json['revenueByProvider']),
      ),
    );
  }
}

class MonthlySales {
  const MonthlySales({
    required this.yearMonth,
    required this.purchases,
    required this.credits,
    required this.grossRevenueBrl,
    required this.byProvider,
  });

  final String yearMonth;
  final int purchases;
  final int credits;
  final double grossRevenueBrl;
  final ProviderRevenue byProvider;

  factory MonthlySales.fromJson(Map<String, dynamic> json) {
    return MonthlySales(
      yearMonth: asString(json['yearMonth']),
      purchases: asInt(json['purchases']),
      credits: asInt(json['credits']),
      grossRevenueBrl: asMoney(json['grossRevenueBrl']),
      byProvider: ProviderRevenue.fromJson(asMap(json['byProvider'])),
    );
  }
}

class RankedCity {
  const RankedCity({
    required this.city,
    required this.state,
    required this.count,
  });

  final String city;
  final String state;
  final int count;

  factory RankedCity.fromJson(Map<String, dynamic> json) {
    return RankedCity(
      city: asString(json['city']),
      state: asString(json['state']),
      count: asInt(json['count']),
    );
  }
}

class RankedCategory {
  const RankedCategory({required this.category, required this.count});

  final String category;
  final int count;

  factory RankedCategory.fromJson(Map<String, dynamic> json) {
    return RankedCategory(
      category: asString(json['category']),
      count: asInt(json['count']),
    );
  }
}

class AdminDashboardInsights {
  const AdminDashboardInsights({
    required this.topCitiesNewAccounts,
    required this.topVenueCategories,
    required this.reportsCreated,
  });

  final List<RankedCity> topCitiesNewAccounts;
  final List<RankedCategory> topVenueCategories;
  final int reportsCreated;

  static const empty = AdminDashboardInsights(
    topCitiesNewAccounts: [],
    topVenueCategories: [],
    reportsCreated: 0,
  );

  factory AdminDashboardInsights.fromJson(Map<String, dynamic> json) {
    return AdminDashboardInsights(
      topCitiesNewAccounts: AdminDashboard._list(
        json['topCitiesNewAccounts'],
        RankedCity.fromJson,
      ),
      topVenueCategories: AdminDashboard._list(
        json['topVenueCategories'],
        RankedCategory.fromJson,
      ),
      reportsCreated: asInt(json['reportsCreated']),
    );
  }
}

class AdminDashboardWarning {
  const AdminDashboardWarning({required this.code, required this.count});

  final String code;
  final int count;

  factory AdminDashboardWarning.fromJson(Map<String, dynamic> json) {
    return AdminDashboardWarning(
      code: asString(json['code']),
      count: asInt(json['count']),
    );
  }
}

class RecentAccount {
  const RecentAccount({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.createdAt,
    this.venueId,
    this.venueName,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final DateTime? createdAt;
  final String? venueId;
  final String? venueName;

  String get displayName {
    final venue = venueName?.trim();
    if (role == 'VENUE' && venue != null && venue.isNotEmpty) return venue;
    return name;
  }

  factory RecentAccount.fromJson(Map<String, dynamic> json) {
    return RecentAccount(
      id: asString(json['id']),
      name: asString(json['name']),
      email: asString(json['email']),
      role: asString(json['role']),
      createdAt: asDateTime(json['createdAt']),
      venueId: json['venueId']?.toString(),
      venueName: json['venueName']?.toString(),
    );
  }
}

class RecentSale {
  const RecentSale({
    required this.id,
    required this.packageKey,
    required this.credits,
    required this.amountPaid,
    required this.currency,
    required this.provider,
    required this.confirmedAt,
    required this.venueId,
    required this.venueName,
  });

  final String id;
  final String packageKey;
  final int credits;
  final double amountPaid;
  final String currency;
  final String? provider;
  final DateTime? confirmedAt;
  final String venueId;
  final String venueName;

  factory RecentSale.fromJson(Map<String, dynamic> json) {
    return RecentSale(
      id: asString(json['id']),
      packageKey: asString(json['packageKey']),
      credits: asInt(json['credits']),
      amountPaid: asMoney(json['amountPaid']),
      currency: asString(json['currency'], fallback: 'BRL'),
      provider: json['provider']?.toString(),
      confirmedAt: asDateTime(json['confirmedAt']),
      venueId: asString(json['venueId']),
      venueName: asString(json['venueName']),
    );
  }
}

class RefundPosition {
  const RefundPosition({
    required this.yearMonth,
    required this.paidSalesBrl,
    required this.fullRefundsBrl,
    required this.partialRefundsBrl,
    required this.partialsWithoutAmount,
    this.refundReviewsOpen = 0,
    required this.revenueAfterRefundsBrl,
    required this.revenueComplete,
  });

  final String yearMonth;
  final double paidSalesBrl;
  final double fullRefundsBrl;
  final double partialRefundsBrl;
  final int partialsWithoutAmount;
  final int refundReviewsOpen;
  final double revenueAfterRefundsBrl;
  final bool revenueComplete;

  factory RefundPosition.fromJson(Map<String, dynamic> json) {
    return RefundPosition(
      yearMonth: asString(json['yearMonth']),
      paidSalesBrl: asMoney(json['paidSalesBrl']),
      fullRefundsBrl: asMoney(json['fullRefundsBrl']),
      partialRefundsBrl: asMoney(json['partialRefundsBrl']),
      partialsWithoutAmount: asInt(json['partialsWithoutAmount']),
      refundReviewsOpen: json['refundReviewsOpen'] == null
          ? 0
          : asInt(json['refundReviewsOpen']),
      revenueAfterRefundsBrl: asMoney(json['revenueAfterRefundsBrl']),
      revenueComplete: json['revenueComplete'] != false,
    );
  }
}

class AdminDashboard {
  const AdminDashboard({
    required this.totals,
    required this.month,
    required this.refundPosition,
    required this.history,
    required this.recentAccounts,
    required this.recentSales,
    required this.warnings,
    this.insights = AdminDashboardInsights.empty,
  });

  final AdminDashboardTotals totals;
  final AdminDashboardMonth month;
  final RefundPosition refundPosition;
  final List<MonthlySales> history;
  final List<RecentAccount> recentAccounts;
  final List<RecentSale> recentSales;
  final List<AdminDashboardWarning> warnings;
  final AdminDashboardInsights insights;

  factory AdminDashboard.fromJson(Map<String, dynamic> json) {
    final insightsRaw = json['insights'];
    return AdminDashboard(
      totals: AdminDashboardTotals.fromJson(asMap(json['totals'])),
      month: AdminDashboardMonth.fromJson(asMap(json['month'])),
      refundPosition: RefundPosition.fromJson(asMap(json['refundPosition'])),
      history: _list(json['history'], MonthlySales.fromJson),
      recentAccounts: _list(json['recentAccounts'], RecentAccount.fromJson),
      recentSales: _list(json['recentSales'], RecentSale.fromJson),
      warnings: _list(json['warnings'], AdminDashboardWarning.fromJson),
      insights: insightsRaw is Map
          ? AdminDashboardInsights.fromJson(
              Map<String, dynamic>.from(insightsRaw),
            )
          : AdminDashboardInsights.empty,
    );
  }

  static List<T> _list<T>(Object? raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => parse(Map<String, dynamic>.from(item)))
        .toList();
  }
}
