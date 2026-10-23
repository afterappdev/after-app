import 'admin_dashboard.dart';
import 'json_util.dart';

class SalesPackageCounts {
  const SalesPackageCounts({
    required this.unit1,
    required this.combo5,
    required this.combo10,
  });

  final int unit1;
  final int combo5;
  final int combo10;

  factory SalesPackageCounts.fromJson(Map<String, dynamic> json) {
    return SalesPackageCounts(
      unit1: asInt(json['unit1']),
      combo5: asInt(json['combo5']),
      combo10: asInt(json['combo10']),
    );
  }
}

class AdminSalesSummary {
  const AdminSalesSummary({
    required this.paidPurchases,
    required this.creditsSold,
    required this.grossRevenueBrl,
    required this.revenueByProvider,
    required this.commonCredits,
    required this.vipCredits,
    required this.packages,
    this.yearMonth,
    this.from,
    this.to,
  });

  final String? yearMonth;
  final String? from;
  final String? to;
  final int paidPurchases;
  final int creditsSold;
  final double grossRevenueBrl;
  final ProviderRevenue revenueByProvider;
  final int commonCredits;
  final int vipCredits;
  final SalesPackageCounts packages;

  factory AdminSalesSummary.fromJson(Map<String, dynamic> json) {
    return AdminSalesSummary(
      yearMonth: json['yearMonth']?.toString(),
      from: json['from']?.toString(),
      to: json['to']?.toString(),
      paidPurchases: asInt(json['paidPurchases']),
      creditsSold: asInt(json['creditsSold']),
      grossRevenueBrl: asMoney(json['grossRevenueBrl']),
      revenueByProvider: ProviderRevenue.fromJson(
        asMap(json['revenueByProvider']),
      ),
      commonCredits: asInt(json['commonCredits']),
      vipCredits: asInt(json['vipCredits']),
      packages: SalesPackageCounts.fromJson(asMap(json['packages'])),
    );
  }
}
