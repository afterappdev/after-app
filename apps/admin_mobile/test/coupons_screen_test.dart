import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_coupon.dart';
import 'package:after_admin/data/paginated.dart';
import 'package:after_admin/features/coupons/coupon_form_screen.dart';
import 'package:after_admin/features/coupons/coupons_controller.dart';
import 'package:after_admin/features/coupons/coupons_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers.dart';

class _CouponApi extends FakeAdminApi {
  _CouponApi(this.page);

  Paginated<AdminCoupon> page;
  int creates = 0;

  @override
  Future<Paginated<AdminCoupon>> coupons({int page = 1, int limit = 20}) async {
    return this.page;
  }

  @override
  Future<AdminCoupon> createCoupon({
    required String code,
    required int creditAmount,
    bool active = true,
    String? startsAt,
    String? expiresAt,
    int? maxRedemptions,
    int maxRedemptionsPerVenue = 1,
  }) async {
    creates += 1;
    if (creditAmount <= 0) {
      throw Exception('inválido');
    }
    return AdminCoupon(
      id: 'c1',
      code: code.toUpperCase(),
      creditAmount: creditAmount,
      active: active,
      maxRedemptionsPerVenue: maxRedemptionsPerVenue,
      redemptionCount: 0,
      createdAt: DateTime.parse('2026-09-28T12:00:00.000Z'),
    );
  }
}

void main() {
  testWidgets('lista cupom com créditos e status', (tester) async {
    final api = _CouponApi(
      Paginated(
        items: [
          AdminCoupon(
            id: 'c1',
            code: 'AFTER2',
            creditAmount: 2,
            active: true,
            maxRedemptionsPerVenue: 1,
            redemptionCount: 0,
            createdAt: DateTime.parse('2026-09-28T12:00:00.000Z'),
          ),
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      ),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => CouponsController(api)),
        ],
        child: const MaterialApp(home: Scaffold(body: CouponsScreen())),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.textContaining('AFTER2'), findsOneWidget);
    expect(find.textContaining('2 crédito'), findsOneWidget);
    expect(find.textContaining('Ativo'), findsOneWidget);
  });

  testWidgets('formulário bloqueia créditos inválidos antes de criar', (tester) async {
    final api = _CouponApi(
      const Paginated(items: [], page: 1, limit: 20, total: 0, totalPages: 0),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => CouponsController(api)),
        ],
        child: const MaterialApp(home: CouponFormScreen()),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), 'AFTER2');
    await tester.enterText(find.byType(TextField).at(1), '0');
    await tester.ensureVisible(find.text('Criar cupom'));
    await tester.tap(find.text('Criar cupom'));
    await tester.pump();
    expect(api.creates, 0);
    expect(find.textContaining('maior que zero'), findsOneWidget);
  });
}
