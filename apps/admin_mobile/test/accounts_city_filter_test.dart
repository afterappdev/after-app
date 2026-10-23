import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_city_scope.dart';
import 'package:after_admin/features/accounts/accounts_controller.dart';
import 'package:after_admin/features/accounts/accounts_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers.dart';

Widget _wrap(AccountsController controller) {
  return MaterialApp(
    home: Provider<AdminApi>.value(
      value: controller.api,
      child: ChangeNotifierProvider.value(
        value: controller,
        child: const Scaffold(body: AccountsScreen()),
      ),
    ),
  );
}

void main() {
  test('AdminCityScope diferencia homônimos pela UF', () {
    const sp = AdminCityScope(city: 'São Paulo', state: 'SP');
    const mg = AdminCityScope(city: 'São Paulo', state: 'MG');
    expect(sp.key, isNot(mg.key));
    expect(sp.label, 'São Paulo, SP');
  });

  test('controller envia city e state juntos à API', () async {
    final api = FakeAdminApi(accountsCitiesData: sampleCityScopes());
    final controller = AccountsController(api);
    await controller.loadCityOptions();
    await controller.setCityScope(
      const AdminCityScope(city: 'São Paulo', state: 'MG'),
    );
    expect(api.lastAccountsCity, 'São Paulo');
    expect(api.lastAccountsState, 'MG');
    expect(api.lastAccountsStatsCity, 'São Paulo');
    expect(api.lastAccountsStatsState, 'MG');
  });

  testWidgets('dropdown exibe cidade e UF para homônimos', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = FakeAdminApi(accountsCitiesData: sampleCityScopes());
    final controller = AccountsController(api);
    await controller.loadCityOptions();
    await tester.pumpWidget(_wrap(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButton<String?>));
    await tester.pumpAndSettle();
    expect(find.text('São Paulo, SP'), findsOneWidget);
    expect(find.text('São Paulo, MG'), findsOneWidget);
  });

  testWidgets('seleção MG preserva UF ao trocar aba', (tester) async {
    tester.view.physicalSize = const Size(1366, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = FakeAdminApi(accountsCitiesData: sampleCityScopes());
    final controller = AccountsController(api);
    await controller.loadCityOptions();
    await controller.setCityScope(
      const AdminCityScope(city: 'São Paulo', state: 'MG'),
    );
    await tester.pumpWidget(_wrap(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Estabelecimentos'));
    await tester.pumpAndSettle();
    expect(controller.selectedCity?.state, 'MG');
    expect(api.lastAccountsState, 'MG');
  });
}
