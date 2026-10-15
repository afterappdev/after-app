import 'dart:async';
import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/location/device_locator.dart';
import 'package:after_app/core/location/geo_origin.dart';
import 'package:after_app/core/location/home_origin_policy.dart';
import 'package:after_app/core/location/origin_cache.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/home/home_feed_cards.dart';
import 'package:after_app/features/home/home_screen.dart';
import 'package:after_app/features/home/home_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeDeviceLocator implements DeviceLocator {
  FakeDeviceLocator({
    this.serviceEnabled = false,
    this.permission = LocationPermission.denied,
    this.requestResult = LocationPermission.denied,
    this.lastKnownOrigin,
    this.currentOrigin,
    this.lastKnownCompleter,
    this.currentCompleter,
  });

  bool serviceEnabled;
  LocationPermission permission;
  LocationPermission requestResult;
  GeoOrigin? lastKnownOrigin;
  GeoOrigin? currentOrigin;
  Completer<GeoOrigin?>? lastKnownCompleter;
  Completer<GeoOrigin?>? currentCompleter;
  int currentCalls = 0;
  int lastKnownCalls = 0;
  int requestPermissionCalls = 0;

  @override
  Future<bool> isServiceEnabled() async => serviceEnabled;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async {
    requestPermissionCalls++;
    permission = requestResult;
    return requestResult;
  }

  @override
  Future<GeoOrigin?> lastKnown() async {
    lastKnownCalls++;
    if (lastKnownCompleter != null) return lastKnownCompleter!.future;
    return lastKnownOrigin;
  }

  @override
  Future<GeoOrigin?> currentPosition({
    Duration timeLimit = HomeOriginPolicy.gpsTimeout,
  }) async {
    currentCalls++;
    if (currentCompleter != null) return currentCompleter!.future;
    return currentOrigin;
  }
}

class MemoryOriginCache extends OriginCache {
  MemoryOriginCache([this.stored]);

  GeoOrigin? stored;

  @override
  Future<GeoOrigin?> read({DateTime? now}) async => stored;

  @override
  Future<void> write(GeoOrigin origin, {DateTime? now}) async {
    stored = origin.copyWith(at: origin.at ?? now ?? DateTime.now());
  }
}

const _campinas = GeoOrigin(lat: -23.5505, lng: -46.6333);
const _near = GeoOrigin(lat: -23.5487, lng: -46.6333);
const _far = GeoOrigin(lat: -23.5469, lng: -46.6333);

Map<String, dynamic> _promo({
  required String title,
  String venueName = 'Bar do Centro',
  String city = 'Campinas',
  String description = 'Detalhe da promoção',
  String category = 'Bar',
  String venueId = 'v1',
  bool isOpen = true,
  double? distanceKm,
  String displayDate = '2026-09-14',
}) {
  return {
    'bannerId': 'b1',
    'title': title,
    'description': description,
    'displayDate': displayDate,
    'isOpen': isOpen,
    'distanceKm': ?distanceKm,
    'venue': {
      'id': venueId,
      'name': venueName,
      'category': category,
      'city': city,
      'lat': _campinas.lat,
      'lng': _campinas.lng,
    },
  };
}

Map<String, dynamic> _venue({
  String name = 'Bar do Centro',
  String city = 'Campinas',
  String description = 'Pub',
  String category = 'Bar',
  String id = 'v1',
  bool isOpen = true,
  double? distanceKm,
}) {
  return {
    'id': id,
    'name': name,
    'description': description,
    'category': category,
    'city': city,
    'state': 'SP',
    'isOpen': isOpen,
    'distanceKm': ?distanceKm,
    'lat': _campinas.lat,
    'lng': _campinas.lng,
  };
}

http.Response _json(Object body, [int status = 200]) {
  return http.Response(jsonEncode(body), status);
}

UserSession _user({String city = 'Campinas', String role = 'USER'}) {
  return UserSession(
    id: 'u1',
    name: 'Ana',
    email: 'ana@after.app',
    role: role,
    state: 'SP',
    city: city,
  );
}

AuthController _auth(
  ApiClient api, {
  String city = 'Campinas',
  String role = 'USER',
}) {
  final auth = AuthController(api: api, storage: AuthStorage());
  auth.user = _user(city: city, role: role);
  auth.bootstrapping = false;
  return auth;
}

Future<void> _useTallSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('A RenderFlex overflowed')) {
      return;
    }
    originalOnError?.call(details);
  };
  addTearDown(() {
    FlutterError.onError = originalOnError;
  });
}

Future<void> _pumpHome(
  WidgetTester tester, {
  required ApiClient api,
  required FakeDeviceLocator locator,
  OriginCache? cache,
  String city = 'Campinas',
}) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: _auth(api, city: city)),
      ],
      child: MaterialApp(
        home: HomeScreen(
          locator: locator,
          originCache: cache ?? MemoryOriginCache(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('_load não espera getCurrentPosition antes das APIs', (
    tester,
  ) async {
    await _useTallSurface(tester);
    var promoStarted = false;
    var venueStarted = false;
    final releasePromo = Completer<void>();
    final releaseVenue = Completer<void>();
    final gps = Completer<GeoOrigin?>();
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      currentCompleter: gps,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          promoStarted = true;
          await releasePromo.future;
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          venueStarted = true;
          await releaseVenue.future;
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    expect(promoStarted, isTrue);
    expect(venueStarted, isTrue);
    expect(gps.isCompleted, isFalse);
    expect(find.text('Happy Hour After'), findsNothing);

    releasePromo.complete();
    releaseVenue.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(gps.isCompleted, isFalse);
  });

  testWidgets('promotions e venues começam em paralelo', (tester) async {
    await _useTallSurface(tester);
    var inFlight = 0;
    var maxInFlight = 0;
    final releasePromo = Completer<void>();
    final releaseVenue = Completer<void>();
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          inFlight++;
          if (inFlight > maxInFlight) maxInFlight = inFlight;
          await releasePromo.future;
          inFlight--;
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          inFlight++;
          if (inFlight > maxInFlight) maxInFlight = inFlight;
          await releaseVenue.future;
          inFlight--;
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    expect(maxInFlight, greaterThanOrEqualTo(2));
    releasePromo.complete();
    releaseVenue.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
  });

  testWidgets('Home funciona sem permissão de localização', (tester) async {
    await _useTallSurface(tester);
    final requests = <Uri>[];
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.denied,
      requestResult: LocationPermission.denied,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        requests.add(req.url);
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(locator.requestPermissionCalls, 1);
    expect(locator.currentCalls, 0);
    expect(
      requests.where((uri) => uri.path.contains('/home/')),
      everyElement(predicate<Uri>((uri) => uri.queryParameters['lat'] == null)),
    );
  });

  testWidgets('Home funciona com location service desligado', (tester) async {
    await _useTallSurface(tester);
    final locator = FakeDeviceLocator(serviceEnabled: false);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(locator.requestPermissionCalls, 0);
    expect(locator.lastKnownCalls, 0);
    expect(locator.currentCalls, 0);
  });

  testWidgets('GPS posterior atualiza distância sem esconder cards', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final gps = Completer<GeoOrigin?>();
    var homeCalls = 0;
    final secondPromo = Completer<void>();
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      currentCompleter: gps,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (!req.url.path.contains('/home/')) return _json([]);
        homeCalls++;
        if (homeCalls <= 2) {
          return _json(
            req.url.path.endsWith('/home/promotions')
                ? [_promo(title: 'Happy Hour After')]
                : [_venue()],
          );
        }
        await secondPromo.future;
        return _json(
          req.url.path.endsWith('/home/promotions')
              ? [_promo(title: 'Happy Hour After')]
              : [_venue()],
        );
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.textContaining('~'), findsNothing);
    expect(homeCalls, 2);

    gps.complete(_campinas);
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(homeCalls, 4);

    secondPromo.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.textContaining('~'), findsWidgets);
  });

  testWidgets('movimento < 300 m não refaz o feed', (tester) async {
    await _useTallSurface(tester);
    var homeCalls = 0;
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      currentOrigin: _near,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.contains('/home/')) homeCalls++;
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(
      tester,
      api: api,
      locator: locator,
      cache: MemoryOriginCache(_campinas),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(homeCalls, 2);
    expect(locator.currentCalls, 1);
  });

  testWidgets('movimento >= 300 m refaz o feed silenciosamente', (
    tester,
  ) async {
    await _useTallSurface(tester);
    var homeCalls = 0;
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      currentOrigin: _far,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.contains('/home/')) homeCalls++;
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(
      tester,
      api: api,
      locator: locator,
      cache: MemoryOriginCache(_campinas),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(homeCalls, 4);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('cache válido entra na primeira request', (tester) async {
    await _useTallSurface(tester);
    final cities = <String?>[];
    final lats = <String?>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.contains('/home/')) {
          cities.add(req.url.queryParameters['city']);
          lats.add(req.url.queryParameters['lat']);
        }
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(
      tester,
      api: api,
      locator: FakeDeviceLocator(),
      cache: MemoryOriginCache(_campinas),
    );
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(cities, everyElement('Campinas'));
    expect(lats, everyElement(_campinas.lat.toString()));
  });

  testWidgets('cache expirado não é usado na primeira request', (tester) async {
    await _useTallSurface(tester);
    final writtenAt = DateTime.utc(2026, 9, 14, 13);
    SharedPreferences.setMockInitialValues({
      OriginCache.storageKey: jsonEncode({
        'lat': _campinas.lat,
        'lng': _campinas.lng,
        'at': writtenAt.millisecondsSinceEpoch,
      }),
    });
    final lats = <String?>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.contains('/home/')) {
          lats.add(req.url.queryParameters['lat']);
        }
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: _auth(api)),
        ],
        child: MaterialApp(
          home: HomeScreen(
            locator: FakeDeviceLocator(),
            originCache: _ExpiredOriginCache(writtenAt: writtenAt),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(lats, everyElement(isNull));
  });

  testWidgets('resposta antiga de cidade não sobrescreve a nova', (
    tester,
  ) async {
    await _useTallSurface(tester);
    SharedPreferences.setMockInitialValues({
      'recent_cities_u1': jsonEncode([
        {'name': 'Campinas', 'uf': 'SP'},
        {'name': 'São Paulo', 'uf': 'SP'},
      ]),
    });
    final campinasPromo = Completer<http.Response>();
    final spPromo = Completer<http.Response>();
    final campinasVenue = Completer<http.Response>();
    final spVenue = Completer<http.Response>();
    final api = ApiClient(
      client: MockClient((req) async {
        final city = req.url.queryParameters['city'];
        if (req.url.path.endsWith('/home/promotions')) {
          if (city == 'São Paulo') return spPromo.future;
          return campinasPromo.future;
        }
        if (req.url.path.endsWith('/home/venues')) {
          if (city == 'São Paulo') return spVenue.future;
          return campinasVenue.future;
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    expect(find.text('Campinas, SP'), findsOneWidget);

    await tester.tap(find.text('Campinas, SP'));
    await tester.pump();
    await tester.pump();
    expect(find.text('São Paulo, SP'), findsOneWidget);
    await tester.tap(find.text('São Paulo, SP'));
    await tester.pump();

    campinasPromo.complete(_json([_promo(title: 'Promo Campinas')]));
    campinasVenue.complete(_json([_venue()]));
    await tester.pump();
    await tester.pump();
    expect(find.text('Promo Campinas'), findsNothing);

    spPromo.complete(
      _json([_promo(title: 'Promo São Paulo', city: 'São Paulo')]),
    );
    spVenue.complete(_json([_venue(city: 'São Paulo')]));
    await tester.pump();
    await tester.pump();
    expect(find.text('Promo São Paulo'), findsOneWidget);
    expect(find.text('Promo Campinas'), findsNothing);
  });

  testWidgets('não chama setState após dispose', (tester) async {
    await _useTallSurface(tester);
    final gps = Completer<GeoOrigin?>();
    final releasePromo = Completer<void>();
    final releaseVenue = Completer<void>();
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      currentCompleter: gps,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          await releasePromo.future;
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          await releaseVenue.future;
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pumpWidget(const SizedBox.shrink());
    gps.complete(_campinas);
    releasePromo.complete();
    releaseVenue.complete();
    await tester.pump();
    await tester.pump();
  });

  testWidgets('last-known pendente não bloqueia os cards', (tester) async {
    await _useTallSurface(tester);
    final lastKnown = Completer<GeoOrigin?>();
    final gps = Completer<GeoOrigin?>();
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.always,
      lastKnownCompleter: lastKnown,
      currentCompleter: gps,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue()]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(lastKnown.isCompleted, isFalse);
    expect(gps.isCompleted, isFalse);
  });

  testWidgets('Home sem promoções mostra locais próximos', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) return _json([]);
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue(name: 'Pub da Esquina')]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();

    expect(find.text('Locais próximos'), findsOneWidget);
    expect(find.text('Pub da Esquina'), findsOneWidget);
    expect(find.text('Promoções / Eventos do dia'), findsNothing);
    expect(find.text('Não há Promoções/ Eventos no dia'), findsNothing);
  });

  testWidgets('Home com promoções também mostra locais abaixo', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue(name: 'Pub da Esquina')]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();

    expect(find.text('Promoções / Eventos do dia'), findsOneWidget);
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.text('Locais próximos'), findsOneWidget);
    expect(find.text('Pub da Esquina'), findsOneWidget);
    expect(find.text('Ver todos'), findsNothing);

    final promoY = tester.getTopLeft(find.text('Happy Hour After')).dy;
    final nearbyY = tester.getTopLeft(find.text('Locais próximos')).dy;
    final venueY = tester.getTopLeft(find.text('Pub da Esquina')).dy;
    expect(promoY, lessThan(nearbyY));
    expect(nearbyY, lessThan(venueY));
  });

  testWidgets('Home sem localização mostra promoções e locais', (tester) async {
    await _useTallSurface(tester);
    final locator = FakeDeviceLocator(
      serviceEnabled: true,
      permission: LocationPermission.denied,
      requestResult: LocationPermission.denied,
    );
    final api = ApiClient(
      client: MockClient((req) async {
        expect(req.url.queryParameters['lat'], isNull);
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue(name: 'Pub da Esquina')]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: locator);
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.text('Locais próximos'), findsOneWidget);
    expect(find.text('Pub da Esquina'), findsOneWidget);
  });

  testWidgets('seções usam laranja nas promoções e roxo nos locais', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([
            _promo(
              title: 'Chopp em dobro',
              description: 'Chopp em dobro até as 20h',
              venueName: 'Refúgio do Chef',
              venueId: 'promo-venue',
              isOpen: false,
              distanceKm: 9.2,
            ),
          ]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([
            _venue(
              name: 'Flash Balada',
              id: 'venue-1',
              description: 'Gente bonita e música boa',
              category: 'Baladas e Boates',
              isOpen: false,
              distanceKm: 1.5,
            ),
          ]);
        }
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();

    final promoTitle = tester.widget<Text>(
      find.text('Promoções / Eventos do dia'),
    );
    final nearbyTitle = tester.widget<Text>(find.text('Locais próximos'));
    expect(_sectionLead(promoTitle), 'Promoções');
    expect(_sectionLeadColor(promoTitle), HomeVisual.orange);
    expect(_sectionRestColor(promoTitle), HomeVisual.titleInk);
    expect(_sectionLead(nearbyTitle), 'Locais');
    expect(_sectionLeadColor(nearbyTitle), HomeVisual.purple);
    expect(_sectionRestColor(nearbyTitle), HomeVisual.titleInk);
    expect(promoTitle.style?.fontSize, HomeVisual.titleFontSize);
    expect(promoTitle.style?.fontWeight, FontWeight.w700);
    expect(nearbyTitle.style?.fontSize, HomeVisual.titleFontSize);
    expect(find.byIcon(Icons.local_fire_department_rounded), findsOneWidget);
    expect(find.byIcon(Icons.location_on_rounded), findsOneWidget);

    final tones = tester
        .widgetList<HomeAccentBar>(find.byType(HomeAccentBar))
        .map((bar) => bar.tone);
    expect(tones, contains(HomeAccentTone.promotion));
    expect(tones, contains(HomeAccentTone.venue));
    expect(find.byType(HomeOfferMark), findsOneWidget);

    final distances = tester
        .widgetList<HomeDistanceLabel>(find.byType(HomeDistanceLabel))
        .toList();
    expect(
      distances.singleWhere((item) => item.label == '~9,2 km').color,
      HomeVisual.muted,
    );
    expect(
      distances.singleWhere((item) => item.label == '~1,5 km').color,
      HomeVisual.purple,
    );

    expect(find.text('Refúgio do Chef'), findsOneWidget);
    expect(find.text('Fechado'), findsWidgets);
    expect(find.text('Chopp em dobro'), findsOneWidget);
    expect(find.text('Chopp em dobro até as 20h'), findsOneWidget);
    expect(find.text('Válido para o dia 14/09/2026'), findsOneWidget);
    expect(find.text('Flash Balada'), findsOneWidget);
    expect(find.text('Baladas e Boates'), findsOneWidget);
    expect(find.text('Campinas'), findsOneWidget);
    expect(find.text('Gente bonita e música boa'), findsOneWidget);
    expect(find.text('Ver todas'), findsNothing);
    expect(find.text('Ver todos'), findsNothing);
    expect(find.text('Sua cidade'), findsOneWidget);
    expect(find.text('Sua localização atual'), findsNothing);
  });

  testWidgets('evento sem oferta não recebe o selo de desconto', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([
            _promo(title: 'Show ao vivo', description: 'Banda local na sexta'),
          ]);
        }
        if (req.url.path.endsWith('/home/venues')) return _json([_venue()]);
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();
    expect(find.text('Show ao vivo'), findsOneWidget);
    expect(find.byType(HomeOfferMark), findsNothing);
  });

  testWidgets('filtro de data pede as promoções do dia escolhido', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final dates = <String?>[];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          final date = req.url.queryParameters['date'];
          dates.add(date);
          final title = dates.length == 1
              ? 'Happy Hour After'
              : 'Promo do sábado';
          return _json([_promo(title: title)]);
        }
        if (req.url.path.endsWith('/home/venues')) return _json([_venue()]);
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();
    expect(find.text('Hoje'), findsOneWidget);
    expect(find.byIcon(Icons.calendar_today_outlined), findsWidgets);

    final nextDay = find.byWidgetPredicate(
      (widget) => widget is HomeDayChip && !widget.selected,
    );
    await tester.tap(nextDay.first);
    await tester.pump();
    await tester.pump();

    expect(dates.length, greaterThan(1));
    expect(dates.last, isNot(dates.first));
    expect(find.text('Promo do sábado'), findsOneWidget);
    expect(find.text('Happy Hour After'), findsNothing);
  });

  testWidgets('toque no card abre o estabelecimento correspondente', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([
            _promo(title: 'Happy Hour After', venueId: 'promo-venue'),
          ]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([_venue(name: 'Pub da Esquina', id: 'venue-1')]);
        }
        return _json([]);
      }),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: _auth(api)),
        ],
        child: MaterialApp(
          onGenerateRoute: (settings) {
            final args = settings.arguments;
            final id = args is Map ? args['venueId']?.toString() : null;
            return MaterialPageRoute<void>(
              settings: settings,
              builder: (_) => Scaffold(body: Text('opened-$id')),
            );
          },
          home: HomeScreen(
            locator: FakeDeviceLocator(),
            originCache: MemoryOriginCache(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.text('Happy Hour After'));
    await tester.pumpAndSettle();
    expect(find.text('opened-promo-venue'), findsOneWidget);

    tester.state<NavigatorState>(find.byType(Navigator)).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pub da Esquina'));
    await tester.pumpAndSettle();
    expect(find.text('opened-venue-1'), findsOneWidget);
  });

  testWidgets('cidade escolhida não é descrita como localização atual', (
    tester,
  ) async {
    await _useTallSurface(tester);
    SharedPreferences.setMockInitialValues({
      'recent_cities_u1': jsonEncode([
        {'name': 'Campinas', 'uf': 'SP'},
        {'name': 'São Paulo', 'uf': 'SP'},
      ]),
    });
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) return _json([]);
        if (req.url.path.endsWith('/home/venues')) return _json([_venue()]);
        return _json([]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();
    expect(find.text('Sua cidade'), findsOneWidget);
    expect(find.text('Sua localização atual'), findsNothing);

    await tester.tap(find.text('Campinas, SP'));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text('São Paulo, SP'));
    await tester.pump();
    expect(find.text('São Paulo, SP'), findsOneWidget);
    expect(find.text('Cidade selecionada'), findsOneWidget);
    expect(find.text('Sua localização atual'), findsNothing);
  });

  testWidgets('listas vazias preservam o estado vazio', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(client: MockClient((req) async => _json([])));

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();
    expect(find.text('Nenhum local cadastrado nesta cidade.'), findsOneWidget);
    expect(find.text('Promoções / Eventos do dia'), findsNothing);
    expect(find.text('Locais próximos'), findsOneWidget);
  });

  testWidgets('carregamento não mostra os cards antes da resposta', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final release = Completer<void>();
    final api = ApiClient(
      client: MockClient((req) async {
        await release.future;
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([_promo(title: 'Happy Hour After')]);
        }
        return _json([_venue(name: 'Pub da Esquina')]);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Happy Hour After'), findsNothing);
    expect(find.text('Locais próximos'), findsNothing);

    release.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('Happy Hour After'), findsOneWidget);
    expect(find.text('Locais próximos'), findsOneWidget);
  });

  testWidgets('falha das duas listas mostra o erro da API', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        return http.Response(jsonEncode({'message': 'Falha na home'}), 500);
      }),
    );

    await _pumpHome(tester, api: api, locator: FakeDeviceLocator());
    await tester.pump();
    expect(find.text('Falha na home'), findsOneWidget);
    expect(find.text('Locais próximos'), findsNothing);
  });

  testWidgets('conta de estabelecimento mantém Publicar na navegação', (
    tester,
  ) async {
    await _useTallSurface(tester);
    final api = ApiClient(client: MockClient((req) async => _json([])));
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: _auth(api, role: 'VENUE')),
        ],
        child: MaterialApp(
          home: HomeScreen(
            locator: FakeDeviceLocator(),
            originCache: MemoryOriginCache(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Pesquisar locais'), findsOneWidget);
    expect(find.text('Publicar'), findsOneWidget);
    expect(find.text('Perfil'), findsOneWidget);
    expect(find.text('Favoritos'), findsNothing);
  });

  testWidgets('home não estoura o layout nas larguras da web', (tester) async {
    final sizes = <Size>[
      const Size(320, 740),
      const Size(360, 780),
      const Size(390, 844),
      const Size(430, 932),
      const Size(768, 1024),
      const Size(1280, 800),
      const Size(1440, 900),
    ];
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/home/promotions')) {
          return _json([
            _promo(
              title: 'Chopp em dobro até o fim da noite no salão principal',
              description:
                  'Descrição longa da promoção para verificar a quebra de linha sem overflow horizontal.',
              venueName: 'Refúgio do Chef e da Casa de Shows',
              distanceKm: 9.2,
            ),
          ]);
        }
        if (req.url.path.endsWith('/home/venues')) {
          return _json([
            _venue(
              name: 'Flash Balada da Cidade',
              description:
                  'Descrição longa do estabelecimento para verificar a leitura em colunas estreitas e largas.',
              distanceKm: 1.5,
            ),
          ]);
        }
        return _json([]);
      }),
    );

    for (final size in sizes) {
      await _pumpHomeAt(tester, api: api, size: size, textScale: 1);
      expect(tester.takeException(), isNull, reason: 'overflow em $size');
      expect(find.text('Promoções / Eventos do dia'), findsOneWidget);
      expect(find.text('Locais próximos'), findsOneWidget);
    }

    await _pumpHomeAt(
      tester,
      api: api,
      size: const Size(390, 844),
      textScale: 1.4,
    );
    expect(tester.takeException(), isNull);
    expect(
      find.text('Chopp em dobro até o fim da noite no salão principal'),
      findsOneWidget,
    );
  });
}

Future<void> _pumpHomeAt(
  WidgetTester tester, {
  required ApiClient api,
  required Size size,
  required double textScale,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: _auth(api)),
      ],
      child: MaterialApp(
        home: HomeScreen(
          locator: FakeDeviceLocator(),
          originCache: MemoryOriginCache(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

String _sectionLead(Text text) {
  final span = text.textSpan;
  if (span is! TextSpan || span.children == null || span.children!.isEmpty) {
    return text.data ?? '';
  }
  final lead = span.children!.first;
  return lead is TextSpan ? lead.text ?? '' : '';
}

Color? _sectionLeadColor(Text text) {
  final span = text.textSpan;
  if (span is! TextSpan || span.children == null || span.children!.isEmpty) {
    return text.style?.color;
  }
  final lead = span.children!.first;
  return lead is TextSpan ? lead.style?.color : null;
}

Color? _sectionRestColor(Text text) {
  final span = text.textSpan;
  if (span is! TextSpan || span.children == null || span.children!.length < 2) {
    return text.style?.color;
  }
  final rest = span.children![1];
  return rest is TextSpan ? rest.style?.color ?? span.style?.color : null;
}

class _ExpiredOriginCache extends OriginCache {
  _ExpiredOriginCache({required this.writtenAt});

  final DateTime writtenAt;

  @override
  Future<GeoOrigin?> read({DateTime? now}) {
    return super.read(now: writtenAt.add(const Duration(minutes: 31)));
  }
}
