import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/venue/promo_validity.dart';
import 'package:after_app/features/venue/venue_public_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

String _iso(DateTime day) {
  final y = day.year.toString().padLeft(4, '0');
  final m = day.month.toString().padLeft(2, '0');
  final d = day.day.toString().padLeft(2, '0');
  return '$y-$m-${d}T00:00:00.000Z';
}

Map<String, dynamic> _banner({
  required String id,
  required List<String> dates,
  String status = 'ACTIVE',
  String title = 'Chopp em dobro',
}) {
  return {
    'id': id,
    'status': status,
    'title': title,
    'description': 'Descrição da promoção',
    'imageUrl': '',
    'creditsCost': dates.length,
    'schedules': [
      for (final date in dates) {'displayDate': date},
    ],
  };
}

Widget _app(ApiClient api) {
  final auth = AuthController(api: api, storage: AuthStorage())
    ..bootstrapping = false
    ..user = UserSession(
      id: 'user-1',
      name: 'Pedro',
      email: 'pedro@after.local',
      role: 'USER',
      state: 'SP',
      city: 'São Paulo',
    );
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: const MaterialApp(
      home: VenuePublicScreen(venueId: 'venue-1'),
    ),
  );
}

ApiClient _api(List<Map<String, dynamic>> banners) {
  return ApiClient(
    client: MockClient((req) async {
      if (req.url.path.endsWith('/venues/venue-1')) {
        return http.Response(
          jsonEncode({
            'id': 'venue-1',
            'name': 'Bar do After',
            'category': 'Bar',
            'description': 'Bar.',
            'city': 'São Paulo',
            'state': 'SP',
            'isOpen': true,
            'photos': [],
            'banners': banners,
            'contacts': {},
            'reviews': [],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('[]', 200, headers: {'content-type': 'application/json'});
    }),
  );
}

Future<void> _open(WidgetTester tester, List<Map<String, dynamic>> banners) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_app(_api(banners)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.ensureVisible(find.text('Promoções em destaque'));
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('data de ontem aparece como promoção vencida', (tester) async {
    final today = saoPauloCalendarDay(DateTime.now());
    final yesterday = DateTime.utc(today.year, today.month, today.day - 1);
    await _open(tester, [
      _banner(id: 'b1', dates: [_iso(yesterday)]),
    ]);
    expect(find.text('Promoção vencida'), findsOneWidget);
    expect(find.textContaining('Válido para o dia'), findsNothing);
  });

  testWidgets('data de hoje permanece válida', (tester) async {
    final today = saoPauloCalendarDay(DateTime.now());
    await _open(tester, [
      _banner(id: 'b1', dates: [_iso(today)]),
    ]);
    expect(find.text('Válido para o dia ${formatCalendarDay(today)}'), findsOneWidget);
    expect(find.text('Promoção vencida'), findsNothing);
  });

  testWidgets('data de amanhã permanece válida', (tester) async {
    final today = saoPauloCalendarDay(DateTime.now());
    final tomorrow = DateTime.utc(today.year, today.month, today.day + 1);
    await _open(tester, [
      _banner(id: 'b1', dates: [_iso(tomorrow)]),
    ]);
    expect(find.text('Válido para o dia ${formatCalendarDay(tomorrow)}'), findsOneWidget);
    expect(find.text('Promoção vencida'), findsNothing);
  });

  testWidgets('várias datas passadas aparecem vencidas', (tester) async {
    await _open(tester, [
      _banner(
        id: 'b1',
        dates: [
          '2026-09-23T00:00:00.000Z',
          '2026-09-24T00:00:00.000Z',
          '2026-09-25T00:00:00.000Z',
          '2026-09-26T00:00:00.000Z',
        ],
      ),
    ]);
    expect(find.text('Promoção vencida'), findsOneWidget);
    expect(find.textContaining('Válido para o dia'), findsNothing);
  });

  testWidgets('uma data futura mantém a promoção na página', (tester) async {
    final today = saoPauloCalendarDay(DateTime.now());
    final tomorrow = DateTime.utc(today.year, today.month, today.day + 1);
    await _open(tester, [
      _banner(
        id: 'b1',
        dates: ['2026-09-23T00:00:00.000Z', _iso(tomorrow)],
      ),
    ]);
    expect(find.text('Válido para o dia ${formatCalendarDay(tomorrow)}'), findsOneWidget);
    expect(find.textContaining('23/09/2026'), findsNothing);
    expect(find.text('Promoção vencida'), findsNothing);
  });

  testWidgets('status CANCELLED não é reescrito como vencida', (tester) async {
    await _open(tester, [
      _banner(
        id: 'b1',
        status: 'CANCELLED',
        dates: ['2020-01-01T00:00:00.000Z'],
      ),
    ]);
    expect(find.text('Promoção vencida'), findsNothing);
    expect(find.text('Cancelada'), findsNothing);
    expect(find.textContaining('Válido para o dia'), findsNothing);
  });
}
