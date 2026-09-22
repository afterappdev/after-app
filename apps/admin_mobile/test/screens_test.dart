import 'package:after_admin/core/formatters/admin_formatters.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_report.dart';
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
}
