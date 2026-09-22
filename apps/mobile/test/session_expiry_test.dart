import 'dart:async';
import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RecordingGoogleSession implements GoogleSessionCleaner {
  int signOuts = 0;

  @override
  Future<void> signOut() async {
    signOuts += 1;
  }

  @override
  Future<void> disconnect() async {}
}

http.Response _json(Object body, [int status = 200]) {
  return http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json'},
  );
}

Future<AuthController> _bootAuth(
  ApiClient api,
  _RecordingGoogleSession google,
) async {
  SharedPreferences.setMockInitialValues({
    AuthStorage.tokenKey: 'expired-jwt',
    AuthStorage.userJsonKey: jsonEncode({
      'id': 'u1',
      'name': 'Ana',
      'email': 'ana@after.local',
      'role': 'USER',
      'state': 'SP',
      'city': 'São Paulo',
    }),
    AuthStorage.notificationsLastPushedKey: 'n-1',
    'home_origin_cache': 'keep-me',
  });
  final auth = AuthController(
    api: api,
    storage: AuthStorage(),
    googleSession: google,
  );
  await auth.bootstrap();
  return auth;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('isOptionalAuthGet', () {
    test('marca apenas os GETs públicos com Optional JWT', () {
      expect(isOptionalAuthGet('/home/promotions'), isTrue);
      expect(isOptionalAuthGet('/home/venues'), isTrue);
      expect(isOptionalAuthGet('/venues'), isTrue);
      expect(isOptionalAuthGet('/venues/search'), isTrue);
      expect(isOptionalAuthGet('/venues/venue-1'), isTrue);
      expect(isOptionalAuthGet('/venues/venue-1/reviews'), isTrue);
      expect(isOptionalAuthGet('/venues/geocode'), isFalse);
      expect(isOptionalAuthGet('/users/me'), isFalse);
      expect(isOptionalAuthGet('/favorites'), isFalse);
      expect(isOptionalAuthGet('/reports'), isFalse);
      expect(isOptionalAuthGet('/notifications'), isFalse);
    });
  });

  test('endpoint público sem token continua funcionando', () async {
    var calls = 0;
    final api = ApiClient(
      client: MockClient((request) async {
        calls += 1;
        expect(request.headers['Authorization'], isNull);
        return _json([
          {'id': 'v1'},
        ]);
      }),
    );

    final body = await api.get('/home/venues');
    expect(body, isA<List>());
    expect(calls, 1);
  });

  test('endpoint público com token válido continua autenticado', () async {
    var calls = 0;
    final api = ApiClient(
      client: MockClient((request) async {
        calls += 1;
        expect(request.headers['Authorization'], 'Bearer valid-jwt');
        return _json([
          {'id': 'v1'},
        ]);
      }),
    );
    final google = _RecordingGoogleSession();
    SharedPreferences.setMockInitialValues({});
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: google,
    );
    api.setToken('valid-jwt');

    final body = await api.get('/venues/search', query: {'q': 'bar'});
    expect(body, isA<List>());
    expect(calls, 1);
    expect(google.signOuts, 0);
    expect(auth.user, isNull);
  });

  test(
    'público com token expirado invalida sessão e tenta uma vez anônimo',
    () async {
      final authed = <bool>[];
      final api = ApiClient(
        client: MockClient((request) async {
          final hasAuth = request.headers['Authorization'] != null;
          authed.add(hasAuth);
          if (hasAuth) {
            expect(request.headers['Authorization'], 'Bearer expired-jwt');
            return _json({'message': 'Unauthorized'}, 401);
          }
          return _json([
            {'id': 'v1', 'name': 'Bar Central'},
          ]);
        }),
      );
      final google = _RecordingGoogleSession();
      final auth = await _bootAuth(api, google);
      expect(auth.user?.id, 'u1');

      final body = await api.get('/venues/venue-1') as List<dynamic>;
      expect(body.first['id'], 'v1');
      expect(authed, [true, false]);
      expect(auth.user, isNull);
      expect(google.signOuts, 1);
      expect(await auth.storage.readToken(), isNull);
      expect(await auth.storage.readUserJson(), isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(AuthStorage.notificationsLastPushedKey), isNull);
      expect(prefs.getString('home_origin_cache'), 'keep-me');
    },
  );

  test('401 em público não entra em retry infinito', () async {
    var calls = 0;
    final api = ApiClient(
      client: MockClient((request) async {
        calls += 1;
        return _json({'message': 'Unauthorized'}, 401);
      }),
    );
    final google = _RecordingGoogleSession();
    final auth = await _bootAuth(api, google);

    await expectLater(
      api.get('/home/promotions'),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
      ),
    );
    expect(calls, 2);
    expect(auth.user, isNull);
    expect(google.signOuts, 1);
  });

  test('endpoint privado 401 invalida sessão e não repete anônimo', () async {
    var calls = 0;
    final api = ApiClient(
      client: MockClient((request) async {
        calls += 1;
        expect(request.headers['Authorization'], isNotNull);
        return _json({'message': 'Unauthorized'}, 401);
      }),
    );
    final google = _RecordingGoogleSession();
    final auth = await _bootAuth(api, google);

    await expectLater(
      api.get('/users/me'),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
      ),
    );
    expect(calls, 1);
    expect(auth.user, isNull);
    expect(google.signOuts, 1);
  });

  test('401 de login sem Bearer não limpa sessão alheia nem retenta', () async {
    var calls = 0;
    final api = ApiClient(
      client: MockClient((request) async {
        calls += 1;
        expect(request.headers['Authorization'], isNull);
        return _json({'message': 'Credenciais inválidas'}, 401);
      }),
    );
    SharedPreferences.setMockInitialValues({});
    final google = _RecordingGoogleSession();
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: google,
    );

    await expectLater(
      api.post('/auth/login', body: {'email': 'a@b.c', 'password': 'x'}),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
      ),
    );
    expect(calls, 1);
    expect(google.signOuts, 0);
    expect(auth.user, isNull);
  });

  test('401 simultâneos limpam a sessão uma única vez', () async {
    var authedCalls = 0;
    var anonymousCalls = 0;
    final release = Completer<void>();
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.headers['Authorization'] != null) {
          authedCalls += 1;
          if (authedCalls >= 2 && !release.isCompleted) {
            release.complete();
          }
          await release.future;
          return _json({'message': 'Unauthorized'}, 401);
        }
        anonymousCalls += 1;
        return _json([
          {'id': 'ok'},
        ]);
      }),
    );
    final google = _RecordingGoogleSession();
    final auth = await _bootAuth(api, google);
    var notifications = 0;
    auth.addListener(() => notifications += 1);

    final results = await Future.wait([
      api.get('/home/venues'),
      api.get('/home/promotions'),
    ]);

    expect(results, hasLength(2));
    expect(authedCalls, 2);
    expect(anonymousCalls, 2);
    expect(google.signOuts, 1);
    expect(auth.user, isNull);
    expect(notifications, 1);
  });
}
