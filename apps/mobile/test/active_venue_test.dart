import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoOpGoogleSession implements GoogleSessionCleaner {
  @override
  Future<void> signOut() async {}

  @override
  Future<void> disconnect() async {}
}

http.Response _json(Object body, {int status = 200}) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

UserSession _owner({
  String? activeVenueId,
  List<OwnedVenueSummary>? venues,
}) {
  return UserSession(
    id: 'owner-1',
    name: 'Owner',
    email: 'owner@after.local',
    role: 'VENUE',
    state: 'SP',
    city: 'São Paulo',
    venueId: 'v1',
    activeVenueId: activeVenueId ?? 'v1',
    venues: venues ??
        const [
          OwnedVenueSummary(
            id: 'v1',
            name: 'Bar A',
            city: 'São Paulo',
            state: 'SP',
          ),
          OwnedVenueSummary(
            id: 'v2',
            name: 'Bar B',
            city: 'Campinas',
            state: 'SP',
          ),
        ],
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('showVenueSwitcher falso com um estabelecimento', () {
    final auth = AuthController(
      api: ApiClient(client: MockClient((_) async => _json({}))),
      storage: AuthStorage(),
    )..bootstrapping = false
      ..user = UserSession(
        id: 'o',
        name: 'X',
        email: 'x@after.local',
        role: 'VENUE',
        state: 'SP',
        city: 'SP',
        venueId: 'v1',
        venues: const [
          OwnedVenueSummary(
            id: 'v1',
            name: 'Único',
            city: 'SP',
            state: 'SP',
          ),
        ],
      );

    expect(auth.showVenueSwitcher, isFalse);
  });

  test('showVenueSwitcher verdadeiro com dois ou mais', () {
    final auth = AuthController(
      api: ApiClient(client: MockClient((_) async => _json({}))),
      storage: AuthStorage(),
    )..bootstrapping = false
      ..user = _owner();

    expect(auth.showVenueSwitcher, isTrue);
  });

  test('switchActiveVenue atualiza sessão, header e generation', () async {
    String? headerSeen;
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'PUT' &&
            request.url.path.endsWith('/users/me/active-venue')) {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['venueId'], 'v2');
          return _json({
            'venueId': 'v1',
            'activeVenueId': 'v2',
            'venues': [
              {
                'id': 'v1',
                'name': 'Bar A',
                'city': 'São Paulo',
                'state': 'SP',
              },
              {
                'id': 'v2',
                'name': 'Bar B',
                'city': 'Campinas',
                'state': 'SP',
              },
            ],
          });
        }
        if (request.url.path.endsWith('/credits/wallet')) {
          headerSeen = request.headers[kActiveVenueIdHeader];
          return _json({'balance': 3, 'vipBalance': 1});
        }
        return _json({});
      }),
    );

    SharedPreferences.setMockInitialValues({AuthStorage.tokenKey: 'token'});
    final auth = AuthController(
      api: client,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )
      ..bootstrapping = false
      ..user = _owner(activeVenueId: 'v1');

    client.setToken('token');
    client.setActiveVenueIdHeader('v1');

    final err = await auth.switchActiveVenue('v2');
    expect(err, isNull);
    expect(auth.user!.activeVenueId, 'v2');
    expect(auth.user!.implicitVenueHeaderId, 'v2');
    expect(auth.venueDataGeneration, 1);

    await client.get('/credits/wallet');
    expect(headerSeen, 'v2');
  });

  test('switchActiveVenue falha mantém seleção anterior', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'PUT') {
          return _json({'message': 'Sem permissão'}, status: 403);
        }
        return _json({});
      }),
    );

    final auth = AuthController(api: client, storage: AuthStorage())
      ..bootstrapping = false
      ..user = _owner(activeVenueId: 'v1');

    client.setActiveVenueIdHeader('v1');
    final err = await auth.switchActiveVenue('v2');
    expect(err, isNotNull);
    expect(auth.user!.activeVenueId, 'v1');
    expect(auth.user!.implicitVenueHeaderId, 'v1');
    expect(auth.venueDataGeneration, 0);
  });

  test('refreshOwnedVenues preenche lista da API', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/users/me/venues')) {
          return _json({
            'venues': [
              {
                'id': 'v1',
                'name': 'Bar A',
                'city': 'São Paulo',
                'state': 'SP',
                'category': ' Bar ',
                'createdAt': '2026-01-01T12:00:00.000Z',
              },
            ],
          });
        }
        return _json({});
      }),
    );

    final auth = AuthController(
      api: client,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )
      ..bootstrapping = false
      ..user = _owner(venues: const []);

    await auth.refreshOwnedVenues();
    expect(auth.user!.venues, hasLength(1));
    expect(auth.user!.venues.first.category, ' Bar ');
    expect(auth.ownedVenuesError, isNull);
  });

  test('logout zera generation e header', () async {
    final client = ApiClient(client: MockClient((_) async => _json({})));
    final auth = AuthController(
      api: client,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )
      ..bootstrapping = false
      ..user = _owner()
      ..venueDataGeneration = 2;

    client.setToken('t');
    client.setActiveVenueIdHeader('v2');
    await auth.logout();
    expect(auth.user, isNull);
    expect(auth.venueDataGeneration, 0);
  });

  test('generation invalida escopo anterior após troca', () async {
    final auth = AuthController(
      api: ApiClient(client: MockClient((_) async => _json({}))),
      storage: AuthStorage(),
    )..bootstrapping = false
      ..user = _owner();

    final scope = auth.venueDataGeneration;
    auth.venueDataGeneration++;
    expect(auth.isVenueScopeCurrent(scope), isFalse);
  });

  test('lista vazia em refreshOwnedVenues mantém venues vazia', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/users/me/venues')) {
          return _json({'venues': []});
        }
        return _json({});
      }),
    );

    final auth = AuthController(
      api: client,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )
      ..bootstrapping = false
      ..user = _owner();

    await auth.refreshOwnedVenues();
    expect(auth.user!.venues, isEmpty);
  });

  test('USER não exibe showVenueSwitcher', () {
    final auth = AuthController(
      api: ApiClient(client: MockClient((_) async => _json({}))),
      storage: AuthStorage(),
    )..bootstrapping = false
      ..user = UserSession(
        id: 'u',
        name: 'C',
        email: 'c@after.local',
        role: 'USER',
        state: 'SP',
        city: 'SP',
      );

    expect(auth.showVenueSwitcher, isFalse);
  });
}
