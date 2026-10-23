import 'package:after_admin/core/config/api_config.dart';
import 'package:after_admin/core/router/admin_location.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/features/accounts/accounts_controller.dart';
import 'package:after_admin/features/coupons/coupons_controller.dart';
import 'package:after_admin/features/dashboard/dashboard_controller.dart';
import 'package:after_admin/features/reports/reports_controller.dart';
import 'package:after_admin/features/sales/sales_controller.dart';
import 'package:after_admin/features/shell/admin_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'helpers.dart';

void main() {
  setUpAll(() async {
    Intl.defaultLocale = 'pt_BR';
    await initializeDateFormatting('pt_BR');
  });
  test('release web usa a API de produção e o mobile permanece local', () {
    expect(
      resolveAdminApiBaseUrl(
        defined: '',
        isWeb: true,
        releaseMode: true,
        platform: TargetPlatform.android,
      ),
      productionApiBaseUrl,
    );
    expect(
      resolveAdminApiBaseUrl(
        defined: 'http://127.0.0.1:3000/',
        isWeb: true,
        releaseMode: true,
        platform: TargetPlatform.android,
      ),
      'http://127.0.0.1:3000',
    );
    expect(
      resolveAdminApiBaseUrl(
        defined: '',
        isWeb: true,
        releaseMode: false,
        platform: TargetPlatform.android,
      ),
      'http://127.0.0.1:3000',
    );
    expect(
      resolveAdminApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.android,
      ),
      'http://10.0.2.2:3000',
    );
    expect(
      resolveAdminApiBaseUrl(
        defined: '',
        isWeb: false,
        releaseMode: true,
        platform: TargetPlatform.iOS,
      ),
      'http://localhost:3000',
    );
  });

  test('hash de /admin abre a seção e o detalhe', () {
    final accounts = locationFromUri(
      Uri.parse('https://app-after.com.br/admin/#/contas'),
    );
    expect(accounts.section, AdminSection.accounts);
    expect(accounts.detailId, isNull);

    final sale = parseAdminLocation('#/vendas/sale%201');
    expect(sale.section, AdminSection.sales);
    expect(sale.detailId, 'sale 1');
    expect(sale.fragment, '/vendas/sale%201');

    expect(parseAdminLocation('/cupons/novo').newCoupon, isTrue);
    expect(parseAdminLocation('/denuncias/r1').section, AdminSection.reports);
    expect(parseAdminLocation('/perfil').settings, isTrue);
    expect(parseAdminLocation('/baixar').section, AdminSection.dashboard);
    expect(parseAdminLocation('').fragment, '/dashboard');
  });

  testWidgets('celular mantém a barra inferior e o desktop usa o menu lateral',
      (tester) async {
    final api = FakeAdminApi(dashboardData: sampleDashboard());
    Future<void> pumpAt(Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(_shell(api));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    addTearDown(tester.view.reset);

    await pumpAt(const Size(360, 780));
    expect(find.byKey(const Key('admin-nav-bar')), findsOneWidget);
    expect(find.byKey(const Key('admin-nav-rail')), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.tap(
      find.descendant(
        of: find.byKey(const Key('admin-nav-bar')),
        matching: find.text('Contas'),
      ),
    );
    await tester.pump();
    expect(find.text('Usuários e estabelecimentos cadastrados'), findsOneWidget);

    await pumpAt(const Size(1280, 800));
    expect(find.byKey(const Key('admin-nav-rail')), findsOneWidget);
    expect(find.byKey(const Key('admin-nav-bar')), findsNothing);
    await tester.tap(find.byKey(const Key('admin-sidebar-2')));
    await tester.pump();
    expect(find.text('Créditos vendidos e histórico de pagamentos'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('endereço interno abre a seção correspondente', (tester) async {
    tester.view.physicalSize = const Size(1100, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = FakeAdminApi(dashboardData: sampleDashboard());
    await tester.pumpWidget(
      _shell(
        api,
        location: const AdminLocation(section: AdminSection.coupons),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Gerencie os cupons de créditos'), findsOneWidget);
    expect(find.text('Novo cupom'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Widget _shell(FakeAdminApi api, {AdminLocation? location}) {
  return MultiProvider(
    providers: [
      Provider<AdminApi>.value(value: api),
      ChangeNotifierProvider(create: (_) => DashboardController(api)),
      ChangeNotifierProvider(create: (_) => AccountsController(api)),
      ChangeNotifierProvider(create: (_) => SalesController(api)),
      ChangeNotifierProvider(create: (_) => CouponsController(api)),
      ChangeNotifierProvider(create: (_) => ReportsController(api)),
    ],
    child: MaterialApp(
      home: AdminShell(initialLocation: location ?? AdminLocation.dashboard),
    ),
  );
}
