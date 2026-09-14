import 'package:after_admin/core/network/api_client.dart';
import 'package:after_admin/data/admin_account.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/paginated.dart';
import 'package:after_admin/features/accounts/account_detail_screen.dart';
import 'package:after_admin/features/accounts/accounts_controller.dart';
import 'package:after_admin/features/accounts/accounts_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
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

AdminAccountDetail _detail({
  String id = 'u1',
  String role = 'USER',
  String name = 'Ana',
  bool withVenue = false,
}) {
  return AdminAccountDetail(
    id: id,
    name: name,
    email: '$id@after.local',
    role: role,
    state: 'SP',
    city: 'Campinas',
    createdAt: DateTime.utc(2026, 9, 1, 12),
    updatedAt: DateTime.utc(2026, 9, 1, 12),
    venue: withVenue || role == 'VENUE'
        ? AdminVenueSummary(
            id: 'v1',
            name: 'Bar Central',
            city: 'Campinas',
            state: 'SP',
            creditBalance: 12,
          )
        : null,
  );
}

AdminAccount _listAccount({
  String id = 'u1',
  String role = 'USER',
  String name = 'Ana',
}) {
  return AdminAccount(
    id: id,
    name: name,
    email: '$id@after.local',
    role: role,
    state: 'SP',
    city: 'Campinas',
    createdAt: DateTime.utc(2026, 9, 1, 12),
  );
}

void _ignoreListTileInkWarning() {
  final original = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('ListTile')) {
      return;
    }
    original?.call(details);
  };
  addTearDown(() {
    FlutterError.onError = original;
  });
}

Future<void> _pumpDetail(
  WidgetTester tester, {
  required FakeAdminApi api,
}) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    _app(
      providers: [Provider<AdminApi>.value(value: api)],
      home: AccountDetailScreen(id: api.accountDetail!.id),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    Intl.defaultLocale = 'pt_BR';
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('botão aparece para USER', (tester) async {
    final api = FakeAdminApi(accountDetail: _detail());
    await _pumpDetail(tester, api: api);
    expect(find.byKey(const Key('admin-delete-account')), findsOneWidget);
    expect(find.text('Excluir conta'), findsOneWidget);
  });

  testWidgets('botão aparece para VENUE', (tester) async {
    final api = FakeAdminApi(
      accountDetail: _detail(id: 'u2', role: 'VENUE', name: 'Bar Central'),
    );
    await _pumpDetail(tester, api: api);
    expect(find.byKey(const Key('admin-delete-account')), findsOneWidget);
  });

  testWidgets('botão não aparece para ADMIN', (tester) async {
    final api = FakeAdminApi(
      accountDetail: _detail(id: 'u-admin', role: 'ADMIN', name: 'Admin'),
    );
    await _pumpDetail(tester, api: api);
    expect(find.byKey(const Key('admin-delete-account')), findsNothing);
    expect(find.text('Excluir conta'), findsNothing);
  });

  testWidgets('confirmação é exibida e cancelar não chama API', (tester) async {
    final api = FakeAdminApi(accountDetail: _detail());
    await _pumpDetail(tester, api: api);
    await tester.tap(find.byKey(const Key('admin-delete-account')));
    await tester.pumpAndSettle();
    expect(find.text('Excluir conta?'), findsOneWidget);
    expect(
      find.textContaining('Esta ação é permanente e não poderá ser desfeita.'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Estabelecimento, saldo, compras'),
      findsNothing,
    );
    await tester.tap(find.byKey(const Key('admin-delete-cancel')));
    await tester.pumpAndSettle();
    expect(api.deletedAccountIds, isEmpty);
    expect(find.text('Excluir conta?'), findsNothing);
  });

  testWidgets('VENUE mostra aviso extra na confirmação', (tester) async {
    final api = FakeAdminApi(
      accountDetail: _detail(role: 'VENUE', name: 'Bar Central'),
    );
    await _pumpDetail(tester, api: api);
    await tester.tap(find.byKey(const Key('admin-delete-account')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining(
        'Estabelecimento, saldo, compras e dados relacionados também poderão ser removidos.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('confirmar chama DELETE e volta com sucesso', (tester) async {
    _ignoreListTileInkWarning();
    final api = FakeAdminApi(
      accountDetail: _detail(),
      accountsPage: Paginated(
        items: [_listAccount()],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      ),
    );
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _app(
        providers: [
          Provider<AdminApi>.value(value: api),
          ChangeNotifierProvider(create: (_) => AccountsController(api)),
        ],
        home: const Scaffold(body: AccountsScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Ana'), findsOneWidget);

    await tester.tap(find.text('Ana'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-delete-account')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-delete-confirm')));
    await tester.pumpAndSettle();

    expect(api.deletedAccountIds, ['u1']);
    expect(find.text('Conta excluída com sucesso'), findsOneWidget);
    expect(find.text('Ana'), findsNothing);
    expect(find.text('Nenhuma conta'), findsOneWidget);
  });

  testWidgets('erro mostra mensagem amigável', (tester) async {
    final api = FakeAdminApi(accountDetail: _detail())
      ..deleteAccountError = 'Não foi possível excluir a conta agora.';
    await _pumpDetail(tester, api: api);
    await tester.tap(find.byKey(const Key('admin-delete-account')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-delete-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('Não foi possível excluir a conta agora.'), findsOneWidget);
    expect(api.deletedAccountIds, isEmpty);
    expect(find.byKey(const Key('admin-delete-account')), findsOneWidget);
  });

  test('HttpAdminApi.deleteAccount chama DELETE /admin/accounts/:id', () async {
    String? method;
    String? path;
    final api = HttpAdminApi(
      ApiClient(
        baseUrl: 'http://localhost',
        client: MockClient((request) async {
          method = request.method;
          path = request.url.path;
          return http.Response(
            '{"success":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      ),
    );
    await api.deleteAccount('u-user');
    expect(method, 'DELETE');
    expect(path, '/admin/accounts/u-user');
  });
}
