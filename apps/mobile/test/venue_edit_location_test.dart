import 'dart:convert';
import 'dart:io';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/venue/venue_edit_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _savedLat = -23.5614;
const _savedLng = -46.6559;

Map<String, dynamic> _venueJson({
  double? lat = _savedLat,
  double? lng = _savedLng,
  String address = 'Rua Augusta, 1500',
}) {
  return {
    'id': 'venue-1',
    'name': 'Bar Central',
    'description': 'Bar',
    'category': 'Bar',
    'city': 'São Paulo',
    'state': 'SP',
    'lat': lat,
    'lng': lng,
    'contacts': {'address': address},
    'hoursJson': {
      'mon': {'open': '10:00', 'close': '22:00'},
    },
    'photos': <dynamic>[],
  };
}

UserSession _owner() {
  return UserSession(
    id: 'owner-1',
    name: 'Bar Central',
    email: 'bar@after.app',
    role: 'VENUE',
    state: 'SP',
    city: 'São Paulo',
    venueId: 'venue-1',
  );
}

AuthController _auth(ApiClient api) {
  final auth = AuthController(api: api, storage: AuthStorage());
  auth.user = _owner();
  auth.bootstrapping = false;
  return auth;
}

http.Response _json(Object body, [int status = 200]) {
  return http.Response(jsonEncode(body), status);
}

Future<void> _useSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('A RenderFlex overflowed') ||
        text.contains('HTTP request failed') ||
        text.contains('NetworkImage')) {
      return;
    }
    originalOnError?.call(details);
  };
  addTearDown(() => FlutterError.onError = originalOnError);
}

Future<void> _pumpEdit(
  WidgetTester tester, {
  required ApiClient api,
}) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: _auth(api)),
      ],
      child: const MaterialApp(home: VenueEditScreen()),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Venue com lat/lng abre o pin salvo e não geocodifica', (
    tester,
  ) async {
    await _useSurface(tester);
    final paths = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        paths.add(req.url.path);
        if (req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson());
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    expect(find.byType(FlutterMap), findsOneWidget);
    expect(find.byIcon(Icons.location_on), findsWidgets);
    expect(paths.where((p) => p.contains('geocode')), isEmpty);
    final map = tester.widget<FlutterMap>(find.byType(FlutterMap));
    expect(map.options.initialCenter.latitude, closeTo(_savedLat, 0.0001));
    expect(map.options.initialCenter.longitude, closeTo(_savedLng, 0.0001));
  });

  testWidgets('tocar no mapa altera a coordenada enviada no PUT', (
    tester,
  ) async {
    await _useSurface(tester);
    Map<String, dynamic>? putBody;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.method == 'GET' && req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson());
        }
        if (req.method == 'PUT') {
          putBody = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(_venueJson());
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    final map = tester.widget<FlutterMap>(find.byType(FlutterMap));
    map.options.onTap!(
      const TapPosition(Offset.zero, Offset.zero),
      const LatLng(-23.5489, -46.6388),
    );
    await tester.pump();
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(putBody, isNotNull);
    expect(putBody!['lat'], -23.5489);
    expect(putBody!['lng'], -46.6388);
    expect(putBody!['lat'] is num, isTrue);
  });

  testWidgets('mudar endereço sem geocode preserva lat/lng no save', (
    tester,
  ) async {
    await _useSurface(tester);
    Map<String, dynamic>? putBody;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.method == 'GET' && req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson());
        }
        if (req.method == 'PUT') {
          putBody = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(_venueJson());
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    await tester.enterText(
      find.widgetWithText(TextField, 'Rua Augusta, 1500'),
      'Rua Nova, 10',
    );
    await tester.pump();
    expect(
      find.text(
        'O endereço foi alterado. Use "Encontrar no mapa" se quiser reposicionar o pin.',
      ),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(putBody!['lat'], _savedLat);
    expect(putBody!['lng'], _savedLng);
    expect((putBody!['contacts'] as Map)['address'], 'Rua Nova, 10');
  });

  testWidgets('Encontrar no mapa usa a nova coordenada', (tester) async {
    await _useSurface(tester);
    Map<String, dynamic>? putBody;
    var geocodeCalls = 0;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/venues/geocode')) {
          geocodeCalls++;
          return _json({'lat': -20.811234, 'lng': -49.375678});
        }
        if (req.method == 'GET' && req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson());
        }
        if (req.method == 'PUT') {
          putBody = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(_venueJson());
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    await tester.ensureVisible(find.text('Encontrar no mapa'));
    await tester.tap(find.text('Encontrar no mapa'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(geocodeCalls, 1);
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(putBody!['lat'], -20.811234);
    expect(putBody!['lng'], -49.375678);
  });

  testWidgets('falha no geocoding não apaga o pin anterior', (tester) async {
    await _useSurface(tester);
    Map<String, dynamic>? putBody;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/venues/geocode')) {
          return _json({'message': 'Não encontramos esse endereço no mapa.'}, 404);
        }
        if (req.method == 'GET' && req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson());
        }
        if (req.method == 'PUT') {
          putBody = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(_venueJson());
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    await tester.tap(find.text('Encontrar no mapa'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Não encontramos esse endereço no mapa.'), findsOneWidget);
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(putBody!['lat'], _savedLat);
    expect(putBody!['lng'], _savedLng);
  });

  testWidgets('sem lat/lng a tela continua funcional', (tester) async {
    await _useSurface(tester);
    Map<String, dynamic>? putBody;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.method == 'GET' && req.url.path.endsWith('/venues/venue-1')) {
          return _json(_venueJson(lat: null, lng: null));
        }
        if (req.method == 'PUT') {
          putBody = jsonDecode(req.body) as Map<String, dynamic>;
          return _json(_venueJson(lat: null, lng: null));
        }
        return _json({});
      }),
    );

    await _pumpEdit(tester, api: api);
    expect(find.byType(FlutterMap), findsOneWidget);
    expect(find.text('Encontrar no mapa'), findsOneWidget);
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(putBody!.containsKey('lat'), isFalse);
    expect(putBody!.containsKey('lng'), isFalse);
  });

  test('edição do venue não usa GPS do dispositivo', () {
    final edit = File('lib/features/venue/venue_edit_screen.dart').readAsStringSync();
    final map = File('lib/features/venue/venue_location_map.dart').readAsStringSync();
    expect(edit.contains('getDevicePosition'), isFalse);
    expect(edit.contains('Geolocator'), isFalse);
    expect(edit.contains('getCurrentPosition'), isFalse);
    expect(map.contains('getDevicePosition'), isFalse);
    expect(map.contains('Geolocator'), isFalse);
  });
}
