import 'dart:async';
import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/location/device_locator.dart';
import 'package:after_app/core/location/geo_origin.dart';
import 'package:after_app/core/location/home_origin_policy.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/notifications/notifications_controller.dart';
import 'package:after_app/features/promo_push/municipality_geocoder.dart';
import 'package:after_app/features/promo_push/promo_alerts_preference.dart';
import 'package:after_app/features/promo_push/promo_publication.dart';
import 'package:after_app/features/promo_push/promo_push_api.dart';
import 'package:after_app/features/promo_push/promo_push_coordinator.dart';
import 'package:after_app/features/promo_push/promo_push_message.dart';
import 'package:after_app/features/promo_push/promo_push_messaging.dart';
import 'package:after_app/features/promo_push/promo_push_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/features/venue/promo_validity.dart';

/// Calendar date for an ACTIVE banner that remains valid after [utcNow].
String _futurePromoDisplayDate({DateTime? utcNow, int daysAhead = 7}) {
  final day = saoPauloCalendarDay(utcNow ?? DateTime.now())
      .add(Duration(days: daysAhead));
  final month = day.month.toString().padLeft(2, '0');
  final dayPart = day.day.toString().padLeft(2, '0');
  return '${day.year}-$month-$dayPart';
}

Map<String, dynamic> _activeVenueFixture() {
  return {
    'id': 'venue-1',
    'banners': [
      {
        'id': 'banner-1',
        'status': 'ACTIVE',
        'schedules': [
          {'displayDate': _futurePromoDisplayDate()},
        ],
      },
    ],
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('preference starts disabled and is not enabled by Android permission', () async {
    final api = RecordingPromoApi();
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.granted;
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.onAuthenticated(_user('user-a', city: 'Campinas'));

    expect(coordinator.enabled, isFalse);
    expect(coordinator.preferenceKnown, isTrue);
    expect(api.registered, isEmpty);
    expect(messaging.permissionRequests, 0);
  });

  test('enabling and disabling follow the backend response', () async {
    final api = RecordingPromoApi();
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.granted
      ..token = 'fcm-1';
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.onAuthenticated(_user('user-a'));

    await coordinator.setEnabled(true);
    expect(coordinator.enabled, isTrue);
    expect(api.registered, ['fcm-1']);

    await coordinator.setEnabled(false);
    expect(coordinator.enabled, isFalse);
    expect(api.removed, ['fcm-1']);
  });

  test('a denied Android permission does not turn the preference on by itself', () async {
    final api = RecordingPromoApi();
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.denied;
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.setEnabled(true);

    expect(api.storedEnabled, isTrue);
    expect(coordinator.enabled, isTrue);
    expect(api.registered, isEmpty);
    expect(
      coordinator.statusMessage,
      'A preferência foi salva, mas o sistema está bloqueando os avisos.',
    );
  });

  test('token is registered, refreshed, and removed on logout', () async {
    final api = RecordingPromoApi();
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.granted
      ..token = 'fcm-1';
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.start(_auth());
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.setEnabled(true);
    expect(api.registered, ['fcm-1']);

    messaging.token = 'fcm-2';
    messaging.refresh.add('fcm-2');
    await Future<void>.delayed(Duration.zero);
    expect(api.registered, ['fcm-1', 'fcm-2']);

    await coordinator.detachCurrentDevice();
    expect(api.removed, contains('fcm-2'));
  });

  test('account switch unlinks the previous user and does not keep the token there', () async {
    final api = RecordingPromoApi()..storedEnabled = true;
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.granted
      ..token = 'shared-device';
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.onAuthenticated(_user('user-a'));
    expect(api.registered, ['shared-device']);

    await coordinator.detachCurrentDevice();
    api.storedEnabled = false;
    await coordinator.onAuthenticated(_user('user-b'));

    expect(api.removed, ['shared-device']);
    expect(api.registered, ['shared-device']);
  });

  test('token registration failure does not report success', () async {
    final api = RecordingPromoApi()..failRegister = true;
    final messaging = FakePromoMessaging()
      ..permission = PromoOsPermission.granted
      ..token = 'fcm-1';
    final coordinator = _coordinator(api: api, messaging: messaging);
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.setEnabled(true);

    expect(coordinator.enabled, isTrue);
    expect(coordinator.statusMessage, 'Não foi possível registrar este aparelho.');
  });

  test('saving failure keeps the previous switch state', () async {
    final api = RecordingPromoApi()..failSave = true;
    final coordinator = _coordinator(api: api);
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.setEnabled(true);

    expect(coordinator.enabled, isFalse);
    expect(
      coordinator.statusMessage,
      'Não foi possível salvar a preferência. Tente novamente.',
    );
  });

  test('registered city works without GPS and is not sent as a location fix', () async {
    final api = RecordingPromoApi();
    final locator = _Locator(permission: LocationPermission.denied);
    final coordinator = _coordinator(
      api: api,
      locator: locator,
      geocoder: _Geocoder(const Municipality(city: 'Campinas', state: 'SP')),
    );
    final user = _user('user-a', city: 'Sorocaba', state: 'SP');
    await coordinator.onAuthenticated(user);
    await coordinator.setEnabled(true);

    expect(user.city, 'Sorocaba');
    expect(api.locations, isEmpty);
    expect(locator.currentCalls, 0);
  });

  test('an already granted location fix updates the authorized city without coordinates', () async {
    final api = RecordingPromoApi();
    final coordinator = _coordinator(
      api: api,
      locator: _Locator(
        permission: LocationPermission.whileInUse,
        origin: GeoOrigin.tryCreate(lat: -22.9, lng: -47.06),
      ),
      geocoder: _Geocoder(const Municipality(city: 'Campinas', state: 'SP')),
    );
    await coordinator.onAuthenticated(_user('user-a', city: 'Sorocaba'));
    await coordinator.setEnabled(true);

    expect(api.locations, [
      {'clear': false, 'city': 'Campinas', 'state': 'SP'},
    ]);
  });

  test('a failed municipality lookup does not update the authorized city', () async {
    final api = RecordingPromoApi();
    final coordinator = _coordinator(
      api: api,
      locator: _Locator(
        permission: LocationPermission.whileInUse,
        origin: GeoOrigin.tryCreate(lat: -22.9, lng: -47.06),
      ),
      geocoder: _Geocoder(null),
    );
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.setEnabled(true);

    expect(api.locations, isEmpty);
  });

  test('VIP parse keeps title, body and optional logo URL', () {
    final vip = PromoPushMessage.parse(
      title: 'Bar Central publicou "Happy Hour"',
      body: 'Confira o que está rolando na sua cidade. Toque para ver!',
      data: {
        'type': 'PROMO_PUBLISHED',
        'eventId': 'event-1',
        'bannerId': 'banner-1',
        'venueId': 'venue-1',
        'imageUrl': 'https://media.app-after.com.br/uploads/logo.jpg',
      },
    );
    expect(vip!.title, 'Bar Central publicou "Happy Hour"');
    expect(vip.imageUrl, 'https://media.app-after.com.br/uploads/logo.jpg');
  });

  test('notification text keeps the backend wording', () {
    final promotion = PromoPushMessage.parse(
      title: 'Bar Central publicou uma promoção para hoje!',
      body: 'Confira o que está rolando na sua cidade. Toque para ver!',
      data: {
        'type': 'PROMO_PUBLISHED',
        'eventId': 'event-1',
        'bannerId': 'banner-1',
        'venueId': 'venue-1',
      },
    );
    expect(promotion!.title, 'Bar Central publicou uma promoção para hoje!');

    final neutral = PromoPushMessage.parse(
      title: 'Bar Central publicou uma novidade para hoje!',
      body: 'Confira o que está rolando na sua cidade. Toque para ver!',
      data: {
        'type': 'PROMO_PUBLISHED',
        'eventId': 'event-2',
        'bannerId': 'banner-2',
        'venueId': 'venue-1',
      },
    );
    expect(neutral!.title, contains('novidade'));
    expect(neutral.title, isNot(contains('promoção')));
    expect(neutral.title, isNot(contains('evento')));
  });

  test('foreground delivery shows one notification and remembers the banner', () async {
    final messaging = FakePromoMessaging();
    final ledger = PromoDeliveryLedger();
    final coordinator = _coordinator(messaging: messaging, ledger: ledger);
    await coordinator.receiveForeground(_message());

    expect(messaging.shown, hasLength(1));
    expect(ledger.alreadyShown('banner-1'), isTrue);
  });

  testWidgets('tap while the app is open opens the publication once', (tester) async {
    final api = RecordingPromoApi()..venue = _activeVenueFixture();
    final harness = await _pumpRouter(tester, api);
    final coordinator = _coordinator(api: api, router: harness.router);
    await coordinator.onAuthenticated(_user('user-a'));

    await coordinator.receiveOpened(_message());
    await tester.pumpAndSettle();
    await coordinator.receiveOpened(_message());
    await tester.pumpAndSettle();

    expect(find.text('banner banner-1'), findsOneWidget);
  });

  testWidgets('tap from a closed app waits for login and then opens', (tester) async {
    final api = RecordingPromoApi()..venue = _activeVenueFixture();
    final messaging = FakePromoMessaging()..launch = _message();
    final harness = await _pumpRouter(tester, api);
    final coordinator = _coordinator(
      api: api,
      messaging: messaging,
      router: harness.router,
    );

    await coordinator.consumeLaunchMessage();
    await tester.pumpAndSettle();
    expect(find.text('banner banner-1'), findsNothing);

    await coordinator.onAuthenticated(_user('user-a'));
    await tester.pumpAndSettle();
    expect(find.text('banner banner-1'), findsOneWidget);
  });

  testWidgets('an unavailable publication shows a message and does not open', (tester) async {
    final api = RecordingPromoApi()
      ..venue = {
        'id': 'venue-1',
        'banners': [
          {
            'id': 'banner-1',
            'status': 'CANCELLED',
            'schedules': [
              {'displayDate': '2026-10-20'},
            ],
          },
        ],
      };
    final harness = await _pumpRouter(tester, api);
    final coordinator = _coordinator(api: api, router: harness.router);
    await coordinator.onAuthenticated(_user('user-a'));
    await coordinator.receiveOpened(_message());
    await tester.pumpAndSettle();

    expect(find.text(promoUnavailableMessage), findsOneWidget);
    expect(find.text('banner banner-1'), findsNothing);
  });

  test('the favorite inbox skips a second visual for a banner already shown', () async {
    SharedPreferences.setMockInitialValues({});
    final ledger = PromoDeliveryLedger()..rememberBanner('banner-1');
    var presented = 0;
    final controller = NotificationsController(
      api: ApiClient(
        client: MockClient((request) async {
          if (request.url.path.endsWith('/unread-count')) {
            return http.Response('{"count":1}', 200);
          }
          return http.Response(
            jsonEncode([
              {
                'id': 'inbox-1',
                'bannerId': 'banner-1',
                'title': 'Favorito',
                'body': 'Nova publicação',
              },
            ]),
            200,
          );
        }),
      ),
      deliveryLedger: ledger,
      presentInbox: ({required title, required body}) async {
        presented += 1;
      },
    );

    await controller.refresh(notifyPush: true);
    expect(presented, 0);
    expect(controller.unreadCount, 1);
  });

  test('a favorite notification is still presented for another publication', () async {
    SharedPreferences.setMockInitialValues({});
    var presented = 0;
    final controller = NotificationsController(
      api: ApiClient(
        client: MockClient((request) async {
          if (request.url.path.endsWith('/unread-count')) {
            return http.Response('{"count":1}', 200);
          }
          return http.Response(
            jsonEncode([
              {
                'id': 'inbox-2',
                'bannerId': 'banner-2',
                'title': 'Favorito',
                'body': 'Nova publicação',
              },
            ]),
            200,
          );
        }),
      ),
      deliveryLedger: PromoDeliveryLedger(),
      presentInbox: ({required title, required body}) async {
        presented += 1;
      },
    );

    await controller.refresh(notifyPush: true);
    expect(presented, 1);
  });

  test('logout and account switch detach while the previous access token is still set', () async {
    SharedPreferences.setMockInitialValues({});
    final seen = <String>[];
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/auth/login')) {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          final email = body['email'] as String;
          final id = email.startsWith('a') ? 'user-a' : 'user-b';
          return http.Response(
            jsonEncode({
              'accessToken': 'token-$id',
              'user': {
                'id': id,
                'name': id,
                'email': email,
                'role': 'USER',
                'state': 'SP',
                'city': 'Campinas',
              },
            }),
            200,
          );
        }
        seen.add('${request.headers['authorization']} ${request.url.path}');
        return http.Response('{}', 200);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage());
    auth.beforeSessionEnd = () => api.get('/session-probe');
    await auth.login(email: 'a@after.app', password: 'secret');
    await auth.login(email: 'b@after.app', password: 'secret');

    expect(seen, contains('Bearer token-user-a /session-probe'));
    expect(auth.user?.id, 'user-b');

    seen.clear();
    await auth.logout().timeout(const Duration(seconds: 2));
    expect(seen, contains('Bearer token-user-b /session-probe'));
    expect(auth.user, isNull);
  });

  test('a rejected detach request does not trap logout', () async {
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/auth/login')) {
          return http.Response(
            jsonEncode({
              'accessToken': 'token-user-a',
              'user': {
                'id': 'user-a',
                'name': 'Ana',
                'email': 'a@after.app',
                'role': 'USER',
                'state': 'SP',
                'city': 'Campinas',
              },
            }),
            200,
          );
        }
        return http.Response('{}', 401);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage());
    api.onUnauthorized = auth.invalidateExpiredSession;
    auth.beforeSessionEnd = () => api.get('/session-probe');
    await auth.login(email: 'a@after.app', password: 'secret');

    await auth.logout().timeout(const Duration(seconds: 2));
    expect(auth.user, isNull);
  });

  test('reverse geocoding accepts a municipality code and ignores a full state name', () {
    final parsed = municipalityFromNominatim({
      'address': {
        'city': 'Campinas',
        'state': 'São Paulo',
        'ISO3166-2-lvl4': 'BR-SP',
      },
    });
    expect(parsed?.city, 'Campinas');
    expect(parsed?.state, 'SP');
    expect(
      municipalityFromNominatim({
        'address': {'city': 'Campinas', 'state': 'São Paulo'},
      }),
      isNull,
    );
  });

  test('the token and location requests omit coordinates', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = ApiClient(
      client: MockClient((request) async {
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        return http.Response(
          '{"id":"row","platform":"android","updatedAt":"2026-10-20T00:00:00.000Z","enabled":true}',
          200,
        );
      }),
    );
    client.setToken('jwt');
    final promoApi = PromoPushApi(client);
    await promoApi.registerToken('fcm-secret');
    await promoApi.setLocation(city: 'Campinas', state: 'SP');

    expect(bodies[0], {'token': 'fcm-secret', 'platform': 'android'});
    expect(bodies[1].containsKey('lat'), isFalse);
    expect(bodies[1].containsKey('lng'), isFalse);
    expect(bodies[1], {'city': 'Campinas', 'state': 'SP'});
  });

  test('publication availability follows cancellation and the civil day', () {
    final now = DateTime.utc(2026, 10, 20, 15);
    expect(
      promoPublicationStatus(
        venue: {
          'banners': [
            {
              'id': 'banner-1',
              'status': 'ACTIVE',
              'schedules': [
                {'displayDate': '2026-10-20'},
              ],
            },
          ],
        },
        bannerId: 'banner-1',
        utcNow: now,
      ),
      PromoPublicationStatus.available,
    );
    expect(
      promoPublicationStatus(
        venue: {
          'banners': [
            {
              'id': 'banner-1',
              'status': 'ACTIVE',
              'schedules': [
                {'displayDate': '2026-10-19'},
              ],
            },
          ],
        },
        bannerId: 'banner-1',
        utcNow: now,
      ),
      PromoPublicationStatus.unavailable,
    );
  });

  testWidgets('the preference control shows the backend state', (tester) async {
    final api = RecordingPromoApi();
    final coordinator = _coordinator(api: api);
    await coordinator.onAuthenticated(_user('user-a'));
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: coordinator,
        child: const MaterialApp(home: Scaffold(body: PromoAlertsPreference())),
      ),
    );

    expect(find.text(PromoAlertsPreference.title), findsOneWidget);
    expect(find.text(PromoAlertsPreference.description), findsOneWidget);
    final switchWidget = tester.widget<Switch>(find.byType(Switch));
    expect(switchWidget.value, isFalse);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
  });
}

PromoPushCoordinator _coordinator({
  RecordingPromoApi? api,
  FakePromoMessaging? messaging,
  PromoDeliveryLedger? ledger,
  PromoPushRouter? router,
  DeviceLocator? locator,
  MunicipalityGeocoder? geocoder,
}) {
  final resolvedApi = api ?? RecordingPromoApi();
  final key = router?.navigatorKey ?? GlobalKey<NavigatorState>();
  return PromoPushCoordinator(
    api: resolvedApi,
    messaging: messaging ?? FakePromoMessaging(),
    ledger: ledger ?? PromoDeliveryLedger(),
    router: router ?? PromoPushRouter(navigatorKey: key, api: resolvedApi),
    cityMemory: MemoryPromoCityMemory(),
    geocoder: geocoder,
    locator: locator,
  );
}

UserSession _user(String id, {String city = 'Campinas', String state = 'SP'}) {
  return UserSession(
    id: id,
    name: id,
    email: '$id@after.app',
    role: 'USER',
    state: state,
    city: city,
  );
}

AuthController _auth() {
  return AuthController(api: ApiClient(), storage: AuthStorage());
}

PromoPushMessage _message() {
  return PromoPushMessage.parse(
    title: 'Bar Central publicou uma promoção para hoje!',
    body: 'Confira o que está rolando na sua cidade. Toque para ver!',
    data: const {
      'type': 'PROMO_PUBLISHED',
      'eventId': 'event-1',
      'bannerId': 'banner-1',
      'venueId': 'venue-1',
      'scheduleId': 'schedule-1',
    },
  )!;
}

Future<_Harness> _pumpRouter(WidgetTester tester, PromoPushApi api) async {
  final key = GlobalKey<NavigatorState>();
  final router = PromoPushRouter(navigatorKey: key, api: api);
  await tester.pumpWidget(
    MaterialApp(
      navigatorKey: key,
      home: const Scaffold(body: Text('home')),
      onGenerateRoute: (settings) {
        if (settings.name != AppRoutes.venuePublic) return null;
        final args = settings.arguments as Map;
        return MaterialPageRoute(
          settings: settings,
          builder: (_) => Scaffold(
            body: Text('banner ${args['focusBannerId']}'),
          ),
        );
      },
    ),
  );
  return _Harness(router);
}

class _Harness {
  _Harness(this.router);
  final PromoPushRouter router;
}

class RecordingPromoApi extends PromoPushApi {
  RecordingPromoApi() : super(ApiClient());

  bool storedEnabled = false;
  bool failSave = false;
  bool failRegister = false;
  final registered = <String>[];
  final removed = <String>[];
  final locations = <Map<String, Object?>>[];
  Map<String, dynamic>? venue;

  @override
  Future<PromoPreference> getPreferences() async {
    return PromoPreference(enabled: storedEnabled, locationFresh: false);
  }

  @override
  Future<PromoPreference> setEnabled(bool enabled) async {
    if (failSave) throw ApiException('offline');
    storedEnabled = enabled;
    return PromoPreference(enabled: enabled, locationFresh: false);
  }

  @override
  Future<void> setLocation({
    bool clear = false,
    String? city,
    String? state,
  }) async {
    locations.add({'clear': clear, 'city': city, 'state': state});
  }

  @override
  Future<void> registerToken(String token) async {
    if (failRegister) throw ApiException('offline');
    registered.add(token);
  }

  @override
  Future<void> unregisterToken(String token) async {
    removed.add(token);
  }

  @override
  Future<Map<String, dynamic>?> getVenue(String venueId) async => venue;
}

class FakePromoMessaging implements PromoPushMessaging {
  PromoOsPermission permission = PromoOsPermission.denied;
  String? token;
  PromoPushMessage? launch;
  int permissionRequests = 0;
  final shown = <PromoPushMessage>[];
  final refresh = StreamController<String>.broadcast();
  final foreground = StreamController<PromoPushMessage>.broadcast();
  final opened = StreamController<PromoPushMessage>.broadcast();

  @override
  Future<bool> initialize() async => true;

  @override
  Future<PromoOsPermission> currentPermission() async => permission;

  @override
  Future<PromoOsPermission> requestPermission() async {
    permissionRequests += 1;
    return permission;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => refresh.stream;

  @override
  Stream<PromoPushMessage> get onForeground => foreground.stream;

  @override
  Stream<PromoPushMessage> get onOpened => opened.stream;

  @override
  Future<PromoPushMessage?> initialMessage() async => launch;

  @override
  Future<void> showForeground(PromoPushMessage message) async {
    shown.add(message);
  }

  @override
  void bindLocalTap(void Function(PromoPushMessage message) onTap) {}

  @override
  bool get isAndroid => true;
}

class _Locator implements DeviceLocator {
  _Locator({required this.permission, this.origin});

  LocationPermission permission;
  GeoOrigin? origin;
  int currentCalls = 0;

  @override
  Future<bool> isServiceEnabled() async => true;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async => permission;

  @override
  Future<GeoOrigin?> lastKnown() async => null;

  @override
  Future<GeoOrigin?> currentPosition({
    Duration timeLimit = HomeOriginPolicy.gpsTimeout,
  }) async {
    currentCalls += 1;
    return origin;
  }
}

class _Geocoder implements MunicipalityGeocoder {
  _Geocoder(this.result);
  final Municipality? result;

  @override
  Future<Municipality?> reverse(double lat, double lng) async => result;
}
