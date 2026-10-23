import 'package:after_admin/core/formatters/admin_formatters.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_dashboard.dart';
import 'package:after_admin/data/admin_report.dart';
import 'package:after_admin/data/admin_sale.dart';
import 'package:after_admin/data/paginated.dart';
import 'package:after_admin/features/sales/sale_detail_screen.dart';
import 'package:after_admin/features/accounts/accounts_controller.dart';
import 'package:after_admin/features/accounts/accounts_screen.dart';
import 'package:after_admin/features/dashboard/dashboard_controller.dart';
import 'package:after_admin/features/dashboard/dashboard_screen.dart';
import 'package:after_admin/features/reports/report_detail_screen.dart';
import 'package:after_admin/features/reports/reports_controller.dart';
import 'package:after_admin/features/reports/reports_screen.dart';
import 'package:after_admin/features/sales/sales_controller.dart';
import 'package:after_admin/features/sales/sales_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import 'helpers.dart';

Widget _app({
  required List<SingleChildWidget> providers,
  required Widget home,
}) {
  return MultiProvider(
    providers: providers,
    child: MaterialApp(
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: home,
    ),
  );
}

void main() {
  setUpAll(() async {
    Intl.defaultLocale = 'pt_BR';
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('dashboard renderiza números reais', (tester) async {
    final api = FakeAdminApi(dashboardData: sampleDashboard());
    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => DashboardController(api)),
        ],
        home: const Scaffold(body: DashboardScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('1.284'), findsOneWidget);
    expect(find.text('986'), findsOneWidget);
    expect(find.text('298'), findsOneWidget);
    expect(find.text('42'), findsOneWidget);
    expect(find.text(formatBrl(7825)), findsWidgets);
    expect(find.text('Google Play'), findsOneWidget);
    expect(find.text('Apple'), findsOneWidget);
    expect(find.text('PIX'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsOneWidget);
    expect(find.text('Reembolsos e receita'), findsOneWidget);
    expect(find.textContaining('Não é o fluxo de caixa'), findsOneWidget);
    expect(find.text('Faturamento bruto'), findsOneWidget);
    expect(find.text('lucro líquido'), findsNothing);
  });

  testWidgets('dashboard com valores zero continua visível', (tester) async {
    final api = FakeAdminApi(
      dashboardData: sampleDashboard(
        accounts: 0,
        users: 0,
        venues: 0,
        newAccounts: 0,
        paidPurchases: 0,
        creditsSold: 0,
        gross: 0,
        play: 0,
        apple: 0,
        pix: 0,
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => DashboardController(api)),
        ],
        home: const Scaffold(body: DashboardScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text(formatBrl(0)), findsWidgets);
    expect(find.text('Google Play'), findsOneWidget);
    expect(find.text('PIX'), findsOneWidget);
  });

  testWidgets('receita incompleta não aparece como valor definitivo', (tester) async {
    final api = FakeAdminApi(
      dashboardData: sampleDashboard(
        gross: 34.9,
        refundPosition: const RefundPosition(
          yearMonth: '2026-09',
          paidSalesBrl: 34.9,
          fullRefundsBrl: 0,
          partialRefundsBrl: 0,
          partialsWithoutAmount: 1,
          revenueAfterRefundsBrl: 34.9,
          revenueComplete: false,
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => DashboardController(api)),
        ],
        home: const Scaffold(body: DashboardScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Incompleta'), findsOneWidget);
    expect(
      find.textContaining('1 reembolso parcial sem valor informado'),
      findsOneWidget,
    );
    expect(find.text('lucro líquido'), findsNothing);
    expect(find.text('Faturamento bruto'), findsOneWidget);
    expect(find.textContaining('verificação necessária'), findsNothing);
  });

  testWidgets('verificação em aberto fica fora dos valores de reembolso', (
    tester,
  ) async {
    final api = FakeAdminApi(
      dashboardData: sampleDashboard(
        gross: 34.9,
        refundPosition: const RefundPosition(
          yearMonth: '2026-09',
          paidSalesBrl: 34.9,
          fullRefundsBrl: 0,
          partialRefundsBrl: 0,
          partialsWithoutAmount: 0,
          refundReviewsOpen: 1,
          revenueAfterRefundsBrl: 34.9,
          revenueComplete: true,
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => DashboardController(api)),
        ],
        home: const Scaffold(body: DashboardScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(
      find.textContaining('1 reembolso com verificação necessária'),
      findsOneWidget,
    );
    expect(find.text('Incompleta'), findsNothing);
    expect(find.text(formatBrl(34.9)), findsWidgets);
  });

  testWidgets('accounts empty state', (tester) async {
    final api = FakeAdminApi();
    await tester.pumpWidget(
      _app(
        providers: [
          ChangeNotifierProvider(create: (_) => AccountsController(api)),
        ],
        home: const Scaffold(body: AccountsScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Nenhuma conta'), findsOneWidget);
  });

  testWidgets('sales empty state', (tester) async {
    final api = FakeAdminApi();
    await tester.pumpWidget(
      _app(
        providers: [
          ChangeNotifierProvider(create: (_) => SalesController(api)),
        ],
        home: const Scaffold(body: SalesScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Nenhuma venda'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsOneWidget);
    expect(find.text('PIX'), findsOneWidget);
  });

  testWidgets('reports empty state', (tester) async {
    final api = FakeAdminApi();
    await tester.pumpWidget(
      _app(
        providers: [
          ChangeNotifierProvider(create: (_) => ReportsController(api)),
        ],
        home: const Scaffold(body: ReportsScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Nenhuma denúncia'), findsOneWidget);
  });

  testWidgets('confirma reexibir estabelecimento ocultado', (tester) async {
    final api = FakeAdminApi(
      reportDetail: AdminReportDetail(
        id: 'r1',
        targetType: 'VENUE',
        targetId: 'v1',
        reason: 'SPAM',
        status: 'RESOLVED',
        createdAt: DateTime.parse('2026-09-22T15:00:00.000Z'),
        targetSnapshot: const {'name': 'Bar Central'},
        moderationAction: 'VENUE_HIDDEN',
        venueHidden: true,
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const ReportDetailScreen(id: 'r1'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Reexibir estabelecimento'), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-report-restore-venue-action')));
    await tester.pumpAndSettle();
    expect(find.text('Reexibir estabelecimento?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-report-restore-venue')));
    await tester.pumpAndSettle();
    expect(api.restoredVenueReportIds, ['r1']);
    expect(find.text('Oculto por moderação'), findsNothing);
  });

  testWidgets('lista marca reembolso total e parcial', (tester) async {
    final api = FakeAdminApi(
      salesPage: Paginated(
        items: [
          _sale(id: 'paid', status: 'PAID'),
          _sale(id: 'refunded', status: 'REFUNDED'),
          _sale(
            id: 'partial',
            status: 'PAID',
            refundKinds: const ['partial_review'],
          ),
          _sale(
            id: 'review',
            status: 'PAID',
            refundKinds: const ['refund_review'],
          ),
        ],
        page: 1,
        limit: 20,
        total: 4,
        totalPages: 1,
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => SalesController(api)),
        ],
        home: const Scaffold(body: SalesScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Todas'), findsOneWidget);
    expect(find.text('Pagas'), findsOneWidget);
    expect(find.text('Reembolsadas'), findsOneWidget);
    expect(find.text('Reembolsada'), findsOneWidget);
    expect(find.text('Reembolso parcial — revisão necessária'), findsOneWidget);
    expect(find.text('Reembolso — verificação necessária'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsWidgets);

    await tester.tap(find.text('Reembolsadas'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.lastSalesStatus, 'refunded');

    await tester.tap(find.text('Pagas'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.lastSalesStatus, 'paid');

    await tester.tap(find.text('Cartão de crédito'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(api.lastSalesProvider, 'card');
  });

  testWidgets('detalhe de estorno total sem auditoria omite campos ausentes', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: _sale(id: 'bare', status: 'REFUNDED'),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'bare'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Reembolsada'), findsOneWidget);
    expect(find.text('Estorno'), findsOneWidget);
    expect(find.text('Valor original'), findsOneWidget);
    expect(find.text('Créditos adquiridos'), findsOneWidget);
    expect(find.text('Valor reembolsado'), findsNothing);
    expect(find.text('Créditos recuperados'), findsNothing);
    expect(find.text('Créditos não recuperados'), findsNothing);
    expect(find.text('Registrado na auditoria em'), findsNothing);
    expect(find.text('Identificador do reembolso'), findsNothing);
  });

  testWidgets('detalhe de estorno total com auditoria mostra o que foi gravado', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: _sale(id: 'short', status: 'REFUNDED').copyWithAudit(
          const AdminRefundAudit(
            kind: 'shortfall',
            recordedAt: null,
            creditsRecovered: 2,
            creditsUnrecovered: 3,
            refundId: 'REF-TOTAL',
          ),
        ),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'short'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Créditos recuperados'), findsOneWidget);
    expect(find.text('Créditos não recuperados'), findsOneWidget);
    expect(find.text('REF-TOTAL'), findsOneWidget);
    expect(find.text('Valor reembolsado'), findsNothing);
    expect(find.text('Reembolso parcial — revisão necessária'), findsNothing);
  });

  testWidgets('detalhe de estorno parcial não vira reembolso total', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: _sale(
          id: 'partial',
          status: 'PAID',
          refundKinds: const ['partial_review'],
        ).copyWithAudit(
          const AdminRefundAudit(
            kind: 'partial_review',
            recordedAt: null,
            refundedAmount: 10,
          ),
        ),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'partial'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Pago'), findsOneWidget);
    expect(find.text('Reembolso parcial — revisão necessária'), findsOneWidget);
    expect(find.text('Reembolsada'), findsNothing);
    expect(find.text('Valor reembolsado'), findsOneWidget);
    expect(find.text('Créditos recuperados'), findsNothing);
  });

  testWidgets('detalhe de verificação não afirma estorno nem parcial', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: _sale(
          id: 'review',
          status: 'PAID',
          refundKinds: const ['refund_review'],
        ).copyWithAudit(
          const AdminRefundAudit(
            kind: 'refund_review',
            recordedAt: null,
          ),
        ),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'review'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Pago'), findsOneWidget);
    expect(find.text('Reembolso — verificação necessária'), findsOneWidget);
    expect(
      find.text(
        'Sinal recebido sem comprovação suficiente. A compra continua paga.',
      ),
      findsOneWidget,
    );
    expect(find.text('Reembolso parcial — revisão necessária'), findsNothing);
    expect(find.text('Reembolsada'), findsNothing);
    expect(find.text('Estorno'), findsNothing);
    expect(find.text('Valor reembolsado'), findsNothing);
  });

  testWidgets('verificação resolvida por estorno total não fica aberta', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: _sale(
          id: 'resolved',
          status: 'REFUNDED',
          refundKinds: const ['refund_review'],
        ).copyWithAudit(
          const AdminRefundAudit(
            kind: 'refund_review',
            recordedAt: null,
          ),
        ),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'resolved'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Reembolsada'), findsOneWidget);
    expect(find.text('Estorno'), findsOneWidget);
    expect(find.text('Verificação anterior'), findsOneWidget);
    expect(find.text('Resolvida'), findsOneWidget);
    expect(find.text('Reembolso — verificação necessária'), findsNothing);
    expect(find.text('Valor reembolsado'), findsNothing);
  });

  testWidgets('divergência posterior ao parcial não aparece como resolvida', (
    tester,
  ) async {
    final api = FakeAdminApi(
      saleDetail: AdminSaleDetail(
        sale: AdminSale(
          id: 'later-review',
          packageKey: 'unit_1',
          credits: 1,
          amountPaid: 34.9,
          currency: 'BRL',
          provider: 'card',
          status: 'PAID',
          confirmedAt: DateTime.utc(2026, 10, 2, 15),
          venueId: 'v',
          venueName: 'Bar',
          refundKinds: const ['partial_review', 'refund_review'],
          refundAudits: [
            AdminRefundAudit(
              kind: 'partial_review',
              recordedAt: DateTime.utc(2026, 10, 2),
              refundedAmount: 10,
            ),
            AdminRefundAudit(
              kind: 'refund_review',
              recordedAt: DateTime.utc(2026, 10, 4),
            ),
          ],
        ),
        createdAt: DateTime.utc(2026, 10, 1),
        venue: const AdminSaleVenue(
          id: 'v',
          name: 'Bar',
          city: 'São Paulo',
          state: 'SP',
        ),
      ),
    );
    await tester.pumpWidget(
      _app(
        providers: [Provider<AdminApi>.value(value: api)],
        home: const SaleDetailScreen(id: 'later-review'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Reembolso parcial — revisão necessária'), findsOneWidget);
    expect(find.text('Situação'), findsOneWidget);
    expect(
      find.text(
        'Sinal recebido sem comprovação suficiente. A compra continua paga.',
      ),
      findsOneWidget,
    );
    expect(find.text('Resolvida'), findsNothing);
  });

  test('parcial posterior encerra a verificação e a compra reembolsada também', () {
    final resolved = AdminSale(
      id: 'resolved-partial',
      packageKey: 'unit_1',
      credits: 1,
      amountPaid: 34.9,
      currency: 'BRL',
      provider: 'card',
      status: 'PAID',
      confirmedAt: DateTime.utc(2026, 10, 2, 15),
      venueId: 'v',
      venueName: 'Bar',
      refundKinds: const ['refund_review', 'partial_review'],
      refundAudits: [
        AdminRefundAudit(
          kind: 'refund_review',
          recordedAt: DateTime.utc(2026, 10, 2),
        ),
        AdminRefundAudit(
          kind: 'partial_review',
          recordedAt: DateTime.utc(2026, 10, 4),
          refundedAmount: 10,
        ),
      ],
    );
    final refunded = _sale(
      id: 'refunded-review',
      status: 'REFUNDED',
      refundKinds: const ['refund_review'],
    );
    expect(resolved.hasOpenRefundReview, isFalse);
    expect(resolved.hasPartialReview, isTrue);
    expect(refunded.hasOpenRefundReview, isFalse);
  });
}

AdminSale _sale({
  required String id,
  required String status,
  List<String> refundKinds = const [],
}) {
  return AdminSale(
    id: id,
    packageKey: 'unit_1',
    credits: 1,
    amountPaid: 34.9,
    currency: 'BRL',
    provider: 'card',
    status: status,
    confirmedAt: DateTime.utc(2026, 10, 1, 15),
    venueId: 'v',
    venueName: 'Bar',
    refundKinds: refundKinds,
  );
}

extension on AdminSale {
  AdminSale copyWithAudit(AdminRefundAudit audit) {
    return AdminSale(
      id: id,
      packageKey: packageKey,
      credits: credits,
      amountPaid: amountPaid,
      currency: currency,
      provider: provider,
      status: status,
      confirmedAt: confirmedAt,
      venueId: venueId,
      venueName: venueName,
      refundKinds: refundKinds,
      refundAudits: [audit],
    );
  }
}
