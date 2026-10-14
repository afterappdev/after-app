import 'package:after_admin/data/admin_dashboard.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

void main() {
  test('parsing do dashboard segue o contrato da API', () {
    final dashboard = AdminDashboard.fromJson(
      Map<String, dynamic>.from(sampleDashboardJson),
    );
    expect(dashboard.totals.accounts, 3);
    expect(dashboard.totals.users, 2);
    expect(dashboard.totals.venues, 1);
    expect(dashboard.month.yearMonth, '2026-09');
    expect(dashboard.month.paidPurchases, 3);
    expect(dashboard.month.creditsSold, 16);
    expect(dashboard.month.grossRevenueBrl, 340);
    expect(dashboard.month.revenueByProvider.googlePlay, 25);
    expect(dashboard.month.revenueByProvider.appStore, 200);
    expect(dashboard.month.revenueByProvider.pix, 115);
    expect(dashboard.month.revenueByProvider.card, 0);
    expect(dashboard.history.first.byProvider.card, 0);
    expect(dashboard.history.first.yearMonth, '2026-08');
    expect(dashboard.recentAccounts.last.venueName, 'Bar Central');
    expect(dashboard.recentSales.first.provider, 'pix');
    expect(dashboard.warnings, isEmpty);
  });

  test('cartão presente entra na origem e o bruto permanece o da API', () {
    final json = Map<String, dynamic>.from(sampleDashboardJson);
    final month = Map<String, dynamic>.from(json['month'] as Map);
    month['paidPurchases'] = 7;
    month['grossRevenueBrl'] = 409.30;
    month['revenueByProvider'] = {
      'google_play': 25,
      'app_store': 200,
      'pix': 115,
      'card': 34.90,
    };
    json['month'] = month;

    final dashboard = AdminDashboard.fromJson(json);

    expect(dashboard.month.paidPurchases, 7);
    expect(dashboard.month.grossRevenueBrl, 409.30);
    expect(dashboard.month.revenueByProvider.googlePlay, 25);
    expect(dashboard.month.revenueByProvider.appStore, 200);
    expect(dashboard.month.revenueByProvider.pix, 115);
    expect(dashboard.month.revenueByProvider.card, 34.90);
  });
}
