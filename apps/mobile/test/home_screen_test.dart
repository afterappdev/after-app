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
import 'package:after_app/features/home/home_screen.dart';
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
}) {
  return {
    'bannerId': 'b1',
    'title': title,
    'description': 'Detalhe da promoção',
    'displayDate': '2026-09-14',
    'isOpen': true,
    'venue': {
      'id': 'v1',
      'name': venueName,
      'category': 'Bar',
      'city': city,
      'lat': _campinas.lat,
      'lng': _campinas.lng,
    },
  };
}

Map<String, dynamic> _venue({
  String name = 'Bar do Centro',
  String city = 'Campinas',
}) {
  return {
    'id': 'v1',
    'name': name,
    'description': 'Pub',
    'category': 'Bar',
    'city': city,
    'state': 'SP',
    'isOpen': true,
    'lat': _campinas.lat,
    'lng': _campinas.lng,
  };
}

http.Response _json(Object body, [int status = 200]) {
  return http.Response(jsonEncode(body), status);
}

UserSession _user({String city = 'Campinas'}) {
  return UserSession(
    id: 'u1',
    name: 'Ana',
    email: 'ana@after.app',
    role: 'USER',
    state: 'SP',
    city: city,
  );
}

AuthController _auth(ApiClient api, {String city = 'Campinas'}) {
  final auth = AuthController(api: api, storage: AuthStorage());
  auth.user = _user(city: city);
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

    await _pumpHome(
      tester,
      api: api,
      locator: FakeDeviceLocator(),
    );
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
      everyElement(
        predicate<Uri>((uri) => uri.queryParameters['lat'] == null),
      ),
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

    spPromo.complete(_json([_promo(title: 'Promo São Paulo', city: 'São Paulo')]));
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
    expect(find.text('Promoções/ Eventos do dia'), findsNothing);
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

    expect(find.text('Promoções/ Eventos do dia'), findsOneWidget);
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
}

class _ExpiredOriginCache extends OriginCache {
  _ExpiredOriginCache({required this.writtenAt});

  final DateTime writtenAt;

  @override
  Future<GeoOrigin?> read({DateTime? now}) {
    return super.read(
      now: writtenAt.add(const Duration(minutes: 31)),
    );
  }
}
