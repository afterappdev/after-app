import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/location/device_locator.dart';
import 'package:after_app/core/location/geo_origin.dart';
import 'package:after_app/core/location/home_origin_policy.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/home/home_feed_cards.dart';
import 'package:after_app/features/home/home_promotions.dart';
import 'package:after_app/features/home/home_screen.dart';
import 'package:after_app/features/home/home_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final today = DateTime.now();
  final todayCivil = DateTime(today.year, today.month, today.day);
  final tomorrow = DateTime(todayCivil.year, todayCivil.month, todayCivil.day + 1);
  final todayKey = _civil(todayCivil);
  final tomorrowKey = _civil(tomorrow);

  Map<String, dynamic> item({
    required String name,
    String venueId = 'v1',
    String bannerId = 'b1',
    bool featured = false,
    String tier = 'COMMON',
    String? displayDate,
    String? status,
    bool blocked = false,
    String? hiddenAt,
    bool isOpen = true,
    double? distanceKm,
    String title = 'Noite',
    String imageUrl = '',
  }) {
    return {
      'bannerId': bannerId,
      'scheduleId': 's-$name',
      'tier': tier,
      'featured': featured,
      'title': title,
      'description': 'Descricao',
      'displayDate': displayDate,
      'status': status,
      'imageUrl': imageUrl,
      'isOpen': isOpen,
      'distanceKm': distanceKm,
      'venue': {
        'id': venueId,
        'name': name,
        'category': 'Bares e Pubs',
        'city': 'Campinas',
        'blocked': blocked,
        'moderationHiddenAt': hiddenAt,
      },
    };
  }

  test('VIP da data vem antes das publicações comuns', () {
    final ordered = orderHomePromotions(
      [
        item(name: 'Comum perto', distanceKm: 0.2, displayDate: todayKey),
        item(
          name: 'VIP longe',
          featured: true,
          tier: 'VIP',
          distanceKm: 8,
          displayDate: todayKey,
          isOpen: false,
        ),
      ],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['VIP longe', 'Comum perto']);
    expect(homePromotionIsFeatured(ordered.first as Map, selectedDay: todayCivil), isTrue);
  });

  test('vários VIPs mantêm a ordem relativa e ficam antes do comum', () {
    final ordered = orderHomePromotions(
      [
        item(name: 'VIP B', featured: true, tier: 'VIP', displayDate: todayKey),
        item(name: 'Comum', displayDate: todayKey),
        item(name: 'VIP A', featured: true, tier: 'VIP', displayDate: todayKey),
      ],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['VIP B', 'VIP A', 'Comum']);
  });

  test('sem VIP a ordem comum permanece', () {
    final ordered = orderHomePromotions(
      [
        item(name: 'Um', displayDate: todayKey),
        item(name: 'Dois', displayDate: todayKey),
      ],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['Um', 'Dois']);
    expect(ordered.every((item) => (item as Map)['featured'] != true), isTrue);
  });

  test('VIP de outra data não recebe destaque na data selecionada', () {
    final friday = item(
      name: 'Sexta VIP',
      bannerId: 'same',
      featured: true,
      tier: 'VIP',
      displayDate: tomorrowKey,
    );
    expect(homePromotionIsFeatured(friday, selectedDay: todayCivil), isFalse);
    final ordered = orderHomePromotions(
      [item(name: 'Quinta', displayDate: todayKey), friday],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['Quinta', 'Sexta VIP']);
  });

  test('o mesmo banner em data comum continua comum', () {
    final commonDay = item(
      name: 'Mesmo lugar',
      bannerId: 'same',
      featured: false,
      tier: 'COMMON',
      displayDate: todayKey,
    );
    expect(homePromotionIsFeatured(commonDay, selectedDay: todayCivil), isFalse);
    final ordered = orderHomePromotions([commonDay], selectedDay: todayCivil);
    expect(ordered, hasLength(1));
    expect((ordered.single as Map)['tier'], 'COMMON');
  });

  test('tier VIP com featured false não entra no destaque', () {
    final fake = item(
      name: 'Só tier',
      tier: 'VIP',
      featured: false,
      displayDate: todayKey,
    );
    expect(homePromotionIsFeatured(fake, selectedDay: todayCivil), isFalse);
    final ordered = orderHomePromotions(
      [
        fake,
        item(name: 'De verdade', featured: true, tier: 'VIP', displayDate: todayKey),
      ],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['De verdade', 'Só tier']);
  });

  test('banner cancelado e estabelecimento bloqueado saem da lista', () {
    final ordered = orderHomePromotions(
      [
        item(name: 'Cancelado', status: 'CANCELLED', featured: true, displayDate: todayKey),
        item(name: 'Bloqueado', blocked: true, featured: true, displayDate: todayKey),
        item(name: 'Oculto', hiddenAt: '2026-10-01T00:00:00.000Z', displayDate: todayKey),
        item(name: 'Visível', displayDate: todayKey),
      ],
      selectedDay: todayCivil,
    );
    expect(ordered.map(_name), ['Visível']);
  });

  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('a Home mostra o VIP antes do comum e sem selo no card comum', (
    tester,
  ) async {
    final queries = <Uri>[];
    await _pumpHome(
      tester,
      queries: queries,
      promotions: [
        item(name: 'Refúgio do Chef', distanceKm: 0.4, displayDate: todayKey),
        item(
          name: 'Sunset Lounge',
          venueId: 'vip-1',
          bannerId: 'vip-b',
          featured: true,
          tier: 'VIP',
          distanceKm: 3,
          displayDate: todayKey,
          title: 'DJ ao vivo',
        ),
      ],
    );

    expect(queries.single.queryParameters['city'], 'Campinas');
    expect(queries.single.queryParameters['date'], todayKey);
    expect(_topOf(tester, 'Sunset Lounge'), lessThan(_topOf(tester, 'Refúgio do Chef')));
    expect(find.byType(HomeVipBadge), findsOneWidget);
    expect(find.text('VIP'), findsOneWidget);
    expect(_vipFrames(tester), 1);
  });

  testWidgets('dois VIPs aparecem antes do comum', (tester) async {
    await _pumpHome(
      tester,
      promotions: [
        item(name: 'Comum', displayDate: todayKey),
        item(
          name: 'VIP Um',
          venueId: 'a',
          featured: true,
          tier: 'VIP',
          displayDate: todayKey,
        ),
        item(
          name: 'VIP Dois',
          venueId: 'b',
          bannerId: 'b2',
          featured: true,
          tier: 'VIP',
          displayDate: todayKey,
        ),
      ],
    );

    expect(find.byType(HomeVipBadge), findsNWidgets(2));
    expect(_topOf(tester, 'VIP Um'), lessThan(_topOf(tester, 'VIP Dois')));
    expect(_topOf(tester, 'VIP Dois'), lessThan(_topOf(tester, 'Comum')));
  });

  testWidgets('nenhum VIP deixa os cards comuns sem borda premium', (tester) async {
    await _pumpHome(
      tester,
      promotions: [item(name: 'Só comum', displayDate: todayKey)],
    );
    expect(find.text('Só comum'), findsOneWidget);
    expect(find.byType(HomeVipBadge), findsNothing);
    expect(_vipFrames(tester), 0);
  });

  testWidgets('filtro de data pede o dia e não destaca VIP de outra data', (
    tester,
  ) async {
    final seenDates = <String>[];
    await _pumpHome(
      tester,
      onPromotions: (request) {
        seenDates.add(request.url.queryParameters['date'] ?? '');
        final date = request.url.queryParameters['date'];
        if (date == tomorrowKey) {
          return [
            item(
              name: 'Comum de amanhã',
              bannerId: 'same',
              featured: false,
              tier: 'COMMON',
              displayDate: tomorrowKey,
            ),
            item(
              name: 'VIP de hoje no payload',
              bannerId: 'same',
              featured: true,
              tier: 'VIP',
              displayDate: todayKey,
            ),
          ];
        }
        return [
          item(
            name: 'VIP de hoje',
            bannerId: 'same',
            featured: true,
            tier: 'VIP',
            displayDate: todayKey,
          ),
        ];
      },
    );

    expect(find.byType(HomeVipBadge), findsOneWidget);
    expect(find.text('VIP de hoje'), findsOneWidget);

    final label = _chipLabel(tomorrow);
    await tester.ensureVisible(find.text(label));
    await tester.tap(find.text(label));
    await tester.pump();
    await tester.pump();

    expect(seenDates, contains(tomorrowKey));
    expect(find.text('Comum de amanhã'), findsOneWidget);
    expect(find.byType(HomeVipBadge), findsNothing);
    expect(find.text('VIP de hoje no payload'), findsOneWidget);
  });

  testWidgets('tier VIP sem featured não ganha selo', (tester) async {
    await _pumpHome(
      tester,
      promotions: [
        item(
          name: 'Tier sem destaque',
          tier: 'VIP',
          featured: false,
          displayDate: todayKey,
        ),
      ],
    );
    expect(find.text('Tier sem destaque'), findsOneWidget);
    expect(find.byType(HomeVipBadge), findsNothing);
  });

  testWidgets('cancelado e bloqueado não aparecem na Home', (tester) async {
    await _pumpHome(
      tester,
      promotions: [
        item(name: 'Cancelado', status: 'CANCELLED', displayDate: todayKey),
        item(name: 'Bloqueado', blocked: true, displayDate: todayKey),
        item(name: 'Casa da Praça', displayDate: todayKey),
      ],
    );
    expect(find.text('Cancelado'), findsNothing);
    expect(find.text('Bloqueado'), findsNothing);
    expect(find.text('Casa da Praça'), findsOneWidget);
  });

  testWidgets('o toque no card VIP abre o estabelecimento', (tester) async {
    await _pumpHome(
      tester,
      promotions: [
        item(
          name: 'Sunset Lounge',
          venueId: 'venue-vip',
          featured: true,
          tier: 'VIP',
          displayDate: todayKey,
        ),
      ],
      routes: {
        AppRoutes.venuePublic: (context) {
          final args = ModalRoute.of(context)!.settings.arguments as Map;
          return Scaffold(body: Text('aberto-${args['venueId']}'));
        },
      },
    );

    await tester.tap(find.text('Sunset Lounge'));
    await tester.pump();
    await tester.pump();
    expect(find.text('aberto-venue-vip'), findsOneWidget);
  });

  testWidgets('card VIP cabe em 320 px com fonte ampliada e nome longo', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) {
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(1.6),
            ),
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              HomePromoCard(
                imageUrl: '',
                venueName: 'Estabelecimento com nome muito comprido para a linha',
                isOpen: true,
                hasOpenInfo: true,
                category: 'Bares e Pubs',
                dealTitle: 'DJ ao vivo nesta sexta com uma programação extensa',
                dealDetail: 'Música, drinks especiais e uma noite incrível te esperam no salão principal',
                validUntil: '21/10/2026',
                distanceLabel: '~1,2 km',
                featured: true,
                onTap: () {},
              ),
              const SizedBox(height: 12),
              HomePromoCard(
                imageUrl: '',
                venueName: 'Refúgio do Chef',
                isOpen: true,
                hasOpenInfo: true,
                category: 'Restaurantes',
                dealTitle: 'Chopp em dobro',
                dealDetail: 'Até as 20h',
                validUntil: '21/10/2026',
                featured: false,
                onTap: () {},
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byType(HomeVipBadge), findsOneWidget);
    expect(_vipFrames(tester), 1);
    final name = tester.getRect(find.text('Estabelecimento com nome muito comprido para a linha'));
    final badge = tester.getRect(find.text('VIP'));
    expect(name.right, lessThanOrEqualTo(badge.left));
    expect(find.text('Refúgio do Chef'), findsOneWidget);
  });
}

String _civil(DateTime day) {
  final month = day.month.toString().padLeft(2, '0');
  final date = day.day.toString().padLeft(2, '0');
  return '${day.year}-$month-$date';
}

String _chipLabel(DateTime day) {
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  final date = day.day.toString().padLeft(2, '0');
  final month = day.month.toString().padLeft(2, '0');
  return '${names[day.weekday - 1]} $date/$month';
}

String _name(dynamic item) => ((item as Map)['venue'] as Map)['name'] as String;

double _topOf(WidgetTester tester, String text) => tester.getTopLeft(find.text(text)).dy;

int _vipFrames(WidgetTester tester) {
  return tester.widgetList<DecoratedBox>(find.byType(DecoratedBox)).where((box) {
    final decoration = box.decoration;
    return decoration is BoxDecoration &&
        decoration.gradient == HomeVisual.vipBorderGradient;
  }).length;
}

class _Locator implements DeviceLocator {
  @override
  Future<LocationPermission> checkPermission() async => LocationPermission.denied;

  @override
  Future<GeoOrigin?> currentPosition({
    Duration timeLimit = HomeOriginPolicy.gpsTimeout,
  }) async {
    return null;
  }

  @override
  Future<bool> isServiceEnabled() async => false;

  @override
  Future<GeoOrigin?> lastKnown() async => null;

  @override
  Future<LocationPermission> requestPermission() async => LocationPermission.denied;
}

Future<void> _pumpHome(
  WidgetTester tester, {
  List<Map<String, dynamic>> promotions = const [],
  List<Uri>? queries,
  List<Map<String, dynamic>> Function(http.Request request)? onPromotions,
  Map<String, WidgetBuilder>? routes,
  Size size = const Size(390, 1400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final api = ApiClient(
    client: MockClient((request) async {
      if (request.url.path.endsWith('/home/promotions')) {
        queries?.add(request.url);
        final body = onPromotions?.call(request) ?? promotions;
        return http.Response(jsonEncode(body), 200);
      }
      if (request.url.path.endsWith('/home/venues')) {
        return http.Response('[]', 200);
      }
      return http.Response('[]', 200);
    }),
  );
  final auth = AuthController(api: api, storage: AuthStorage())
    ..bootstrapping = false
    ..user = UserSession(
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.app',
      role: 'USER',
      state: 'SP',
      city: 'Campinas',
    );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
      ],
      child: MaterialApp(
        home: HomeScreen(locator: _Locator()),
        routes: routes ?? const {},
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}
