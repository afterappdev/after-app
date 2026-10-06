import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/credits/credits_screen.dart';
import 'package:after_app/features/credits/publication_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _banner({
  required String id,
  required String status,
  required List<String> dates,
  String title = 'Chopp em dobro todos os dias!',
  String description = 'Descrição Y',
  String imageUrl = 'https://cdn.example/promo-x.jpg',
  int creditsCost = 4,
}) {
  return {
    'id': id,
    'status': status,
    'title': title,
    'description': description,
    'imageUrl': imageUrl,
    'creditsCost': creditsCost,
    'createdAt': '2026-09-01T12:00:00.000Z',
    'schedules': [
      for (final date in dates)
        {'id': 'sch-$date', 'displayDate': date, 'citySnapshot': 'São Paulo'},
    ],
  };
}

http.Response _json(Object body, [int status = 200]) {
  return http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json'},
  );
}

class _ApiLog {
  final requests = <http.Request>[];
  int balance = 10;
  List<Map<String, dynamic>> history = [];
  Map<String, dynamic>? created;

  ApiClient client() {
    return ApiClient(
      client: MockClient((req) async {
        requests.add(req);
        final path = req.url.path;
        if (path.endsWith('/credits/wallet')) {
          return _json({'balance': balance});
        }
        if (path.endsWith('/banners/history')) return _json(history);
        if (path.endsWith('/banners/pricing')) {
          return _json({'creditPerDisplayDay': 1});
        }
        if (path.endsWith('/credits/packages')) return _json([]);
        if (path.endsWith('/credits/purchases')) return _json([]);
        if (req.method == 'POST' && path.endsWith('/banners')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final banner = <String, dynamic>{
            'id': 'banner-new',
            'status': 'ACTIVE',
            'title': body['title'],
            'description': body['description'],
            'imageUrl': body['imageUrl'],
            'creditsCost': (body['dates'] as List).length,
            'createdAt': '2026-10-06T15:00:00.000Z',
            'schedules': [
              for (final date in body['dates'] as List)
                {'displayDate': date},
            ],
          };
          created = banner;
          balance -= banner['creditsCost'] as int;
          history = [...history, banner];
          return _json(banner);
        }
        return _json({'message': 'not found'}, 404);
      }),
    );
  }
}

Future<void> _open(WidgetTester tester, _ApiLog api) async {
  tester.view.physicalSize = const Size(500, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('HTTP request failed') ||
        text.contains('NetworkImage') ||
        text.contains('A RenderFlex overflowed')) {
      return;
    }
    originalOnError?.call(details);
  };
  addTearDown(() => FlutterError.onError = originalOnError);

  final client = api.client();
  final auth = AuthController(api: client, storage: AuthStorage())
    ..bootstrapping = false
    ..user = UserSession(
      id: 'owner-1',
      name: 'Bar',
      email: 'bar@after.local',
      role: 'VENUE',
      state: 'SP',
      city: 'São Paulo',
      venueId: 'venue-1',
    );
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: client),
        ChangeNotifierProvider<AuthController>.value(value: auth),
      ],
      child: const MaterialApp(home: CreditsScreen()),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _until(WidgetTester tester, Finder finder) {
  return tester.scrollUntilVisible(
    finder,
    400,
    scrollable: find.byType(Scrollable).first,
  );
}

Future<void> _openMenu(WidgetTester tester) async {
  final menu = find.byTooltip('Ações da publicação');
  await _until(tester, menu);
  await tester.tap(menu);
  await tester.pumpAndSettle();
}

Future<void> _republish(WidgetTester tester) async {
  await _openMenu(tester);
  await tester.tap(find.text('Publicar novamente'));
  await tester.pumpAndSettle();
}

int _futureDay() {
  final now = DateTime.now();
  return DateTime(now.year, now.month + 1, 0).day;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('o modelo reaproveita imagem, título e descrição e ignora o resto', () {
    final source = _banner(
      id: 'banner-old',
      status: 'CANCELLED',
      dates: ['2026-09-22T00:00:00.000Z'],
    );
    final draft = PublicationDraft.fromHistory(source);

    expect(draft.imageUrl, 'https://cdn.example/promo-x.jpg');
    expect(draft.title, 'Chopp em dobro todos os dias!');
    expect(draft.description, 'Descrição Y');
  });

  testWidgets('Publicar novamente abre o formulário preenchido sem as datas antigas', (
    tester,
  ) async {
    final api = _ApiLog()
      ..history = [
        _banner(
          id: 'banner-old',
          status: 'ACTIVE',
          dates: ['2026-09-22T00:00:00.000Z', '2026-09-26T00:00:00.000Z'],
        ),
      ];
    await _open(tester, api);
    expect(find.text('Cancelada'), findsNothing);

    await _republish(tester);

    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    expect(fields[0].controller?.text, 'Chopp em dobro todos os dias!');
    expect(fields[1].controller?.text, 'Descrição Y');
    expect(find.text('Selecione a data'), findsOneWidget);
    expect(find.textContaining('22/09'), findsOneWidget);
    expect(api.requests.where((req) => req.method == 'POST'), isEmpty);
  });

  testWidgets('o usuário edita os campos, escolhe data nova e confirma o débito', (
    tester,
  ) async {
    final api = _ApiLog()
      ..balance = 8
      ..history = [
        _banner(
          id: 'banner-old',
          status: 'CANCELLED',
          dates: ['2026-09-22T00:00:00.000Z'],
          creditsCost: 3,
        ),
      ];
    await _open(tester, api);
    await _until(tester, find.text('Cancelada'));
    expect(find.text('Cancelada'), findsOneWidget);
    await tester.tap(find.byTooltip('Ações da publicação'));
    await tester.pumpAndSettle();
    expect(find.text('Publicar novamente'), findsOneWidget);
    expect(find.text('Excluir promoção'), findsNothing);
    await tester.tap(find.text('Publicar novamente'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Chopp novo');
    await tester.enterText(find.byType(TextField).at(1), 'Descrição nova');

    await tester.tap(find.text('Postar publicação'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Selecione ao menos uma data.'), findsOneWidget);

    final day = _futureDay();
    await _until(tester, find.text('$day'));
    await tester.tap(find.text('$day'));
    await tester.pump();

    await _until(tester, find.text('Postar publicação'));
    await tester.tap(find.text('Postar publicação'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmar publicação'), findsOneWidget);
    expect(find.textContaining('1 crédito'), findsWidgets);

    await tester.tap(find.widgetWithText(TextButton, 'Publicar'));
    await tester.pumpAndSettle();

    final posts = api.requests.where(
      (req) => req.method == 'POST' && req.url.path.endsWith('/banners'),
    );
    expect(posts, hasLength(1));
    final body = jsonDecode(posts.single.body) as Map<String, dynamic>;
    expect(body.keys.toSet(), {'imageUrl', 'dates', 'title', 'description'});
    expect(body['imageUrl'], 'https://cdn.example/promo-x.jpg');
    expect(body['title'], 'Chopp novo');
    expect(body['description'], 'Descrição nova');
    expect(body['dates'], isNot(contains('2026-09-22')));
    expect((body['dates'] as List), hasLength(1));
    expect(api.created?['id'], 'banner-new');
    expect(api.balance, 7);
    expect(
      api.requests.where((req) => req.url.path.contains('/uploads')),
      isEmpty,
    );
    expect(find.text('Chopp em dobro todos os dias!'), findsOneWidget);
    expect(find.text('Cancelada'), findsOneWidget);
  });

  testWidgets('promoção vencida também serve de modelo', (tester) async {
    final api = _ApiLog()
      ..history = [
        _banner(
          id: 'banner-expired',
          status: 'ACTIVE',
          dates: ['2020-01-02T00:00:00.000Z'],
        ),
      ];
    await _open(tester, api);
    await _republish(tester);
    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    expect(fields[0].controller?.text, 'Chopp em dobro todos os dias!');
    expect(find.text('Selecione a data'), findsOneWidget);
    expect(find.text('Promoção vencida'), findsNothing);
  });

  testWidgets('saldo insuficiente segue o fluxo atual e não publica', (tester) async {
    final api = _ApiLog()
      ..balance = 0
      ..history = [
        _banner(
          id: 'banner-old',
          status: 'ACTIVE',
          dates: ['2026-09-22T00:00:00.000Z'],
        ),
      ];
    await _open(tester, api);
    await _republish(tester);

    final day = _futureDay();
    await _until(tester, find.text('$day'));
    await tester.tap(find.text('$day'));
    await tester.pump();
    await _until(tester, find.text('Postar publicação'));
    await tester.tap(find.text('Postar publicação'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('Saldo insuficiente'), findsWidgets);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.arrow_back_ios_new_rounded), findsOneWidget);
    expect(
      api.requests.where((req) => req.method == 'POST' && req.url.path.endsWith('/banners')),
      isEmpty,
    );
  });

  testWidgets('publicação nova sem modelo continua exigindo imagem', (tester) async {
    final api = _ApiLog()..history = [];
    await _open(tester, api);
    expect(find.text('Toque para selecionar uma imagem'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'Título novo');
    await tester.enterText(find.byType(TextField).at(1), 'Descrição nova');
    await _until(tester, find.text('Postar publicação'));
    await tester.tap(find.text('Postar publicação'));
    await tester.pump();
    expect(find.text('Selecione uma imagem da publicação.'), findsOneWidget);
    expect(api.requests.where((req) => req.method == 'POST'), isEmpty);
  });

  testWidgets('publicação ativa mantém a exclusão no menu', (tester) async {
    final api = _ApiLog()
      ..history = [
        _banner(
          id: 'banner-old',
          status: 'ACTIVE',
          dates: ['2026-10-20T00:00:00.000Z'],
        ),
      ];
    await _open(tester, api);
    await _openMenu(tester);
    await tester.pumpAndSettle();
    expect(find.text('Publicar novamente'), findsOneWidget);
    expect(find.text('Excluir promoção'), findsOneWidget);
    expect(find.byIcon(Icons.delete_outline), findsNothing);
  });
}
