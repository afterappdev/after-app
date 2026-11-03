import 'dart:async';
import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/validation/br_document_validator.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/venue_fiscal_document_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoOpGoogleSession implements GoogleSessionCleaner {
  @override
  Future<void> signOut() async {}

  @override
  Future<void> disconnect() async {}
}

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

UserSession _owner({
  List<OwnedVenueSummary>? venues,
  String? activeVenueId,
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
        ],
  );
}

AuthController _auth(ApiClient client) => AuthController(
      api: client,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )..bootstrapping = false;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('USER não pode cadastrar estabelecimento adicional', () async {
    final auth = _auth(ApiClient(client: MockClient((_) async => _json({}))))
      ..user = UserSession(
        id: 'u1',
        name: 'U',
        email: 'u@after.local',
        role: 'USER',
        state: 'SP',
        city: 'SP',
      );

    final result = await auth.createAdditionalOwnedVenue(
      name: 'Bar',
      city: 'SP',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );
    expect(result.created, isFalse);
    expect(result.createError, isNotNull);
  });

  test('cadastro bem-sucedido atualiza lista e troca ativo', () async {
    var posts = 0;
    String? putVenueId;
    final client = ApiClient(
      client: MockClient((request) async {
        final path = request.url.path;
        if (request.method == 'POST' && path.endsWith('/venues')) {
          posts += 1;
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['name'], 'Bar Novo');
          expect(body['documentType'], 'CPF');
          return _json({'id': 'v-new', 'name': 'Bar Novo'});
        }
        if (path.endsWith('/users/me/venues')) {
          return _json({
            'venues': [
              {'id': 'v1', 'name': 'A', 'city': 'SP', 'state': 'SP'},
              {'id': 'v-new', 'name': 'Bar Novo', 'city': 'SP', 'state': 'SP'},
            ],
          });
        }
        if (request.method == 'PUT' &&
            path.endsWith('/users/me/active-venue')) {
          putVenueId = (jsonDecode(request.body) as Map)['venueId'] as String?;
          return _json({
            'venueId': 'v1',
            'activeVenueId': 'v-new',
            'venues': [
              {'id': 'v1', 'name': 'A', 'city': 'SP', 'state': 'SP'},
              {'id': 'v-new', 'name': 'Bar Novo', 'city': 'SP', 'state': 'SP'},
            ],
          });
        }
        return _json({});
      }),
    );

    SharedPreferences.setMockInitialValues({AuthStorage.tokenKey: 'jwt'});
    final auth = _auth(client)..user = _owner();

    final result = await auth.createAdditionalOwnedVenue(
      name: 'Bar Novo',
      city: 'São Paulo',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );

    expect(posts, 1);
    expect(result.created, isTrue);
    expect(result.venueId, 'v-new');
    expect(putVenueId, 'v-new');
    expect(auth.user!.activeVenueId, 'v-new');
    expect(auth.user!.venues, hasLength(2));
    expect(auth.venueDataGeneration, 1);
  });

  test('mesmo CPF pode ser reutilizado pelo mesmo proprietário', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/venues')) {
          return _json({'id': 'v2', 'name': 'Filial'});
        }
        if (request.url.path.endsWith('/users/me/venues')) {
          return _json({
            'venues': [
              {'id': 'v1', 'name': 'A', 'city': 'SP', 'state': 'SP'},
              {'id': 'v2', 'name': 'Filial', 'city': 'SP', 'state': 'SP'},
            ],
          });
        }
        if (request.method == 'PUT') {
          return _json({
            'venueId': 'v1',
            'activeVenueId': 'v2',
            'venues': [
              {'id': 'v1', 'name': 'A', 'city': 'SP', 'state': 'SP'},
              {'id': 'v2', 'name': 'Filial', 'city': 'SP', 'state': 'SP'},
            ],
          });
        }
        return _json({});
      }),
    );
    final auth = _auth(client)..user = _owner();
    final result = await auth.createAdditionalOwnedVenue(
      name: 'Filial',
      city: 'Campinas',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );
    expect(result.created, isTrue);
  });

  test('conflito de documento retorna mensagem da API', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'POST') {
          return _json(
            {
              'message':
                  'Este CPF ou CNPJ já está vinculado a outro estabelecimento.',
            },
            409,
          );
        }
        return _json({});
      }),
    );
    final auth = _auth(client)..user = _owner();
    final result = await auth.createAdditionalOwnedVenue(
      name: 'X',
      city: 'SP',
      state: 'SP',
      documentType: 'CNPJ',
      documentNumber: '11.444.777/0001-60',
    );
    expect(result.created, isFalse);
    expect(
      result.createError,
      contains('já está vinculado'),
    );
  });

  test('falha de conexão não altera sessão', () async {
    final auth = _auth(
      ApiClient(
        client: MockClient((_) async {
          throw http.ClientException('offline');
        }),
      ),
    )..user = _owner();
    final before = auth.user!.venues.length;
    final result = await auth.createAdditionalOwnedVenue(
      name: 'X',
      city: 'SP',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );
    expect(result.created, isFalse);
    expect(auth.user!.venues.length, before);
  });

  test('envio duplicado bloqueado enquanto POST está em andamento', () async {
    final gate = Completer<void>();
    var posts = 0;
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/venues')) {
          posts += 1;
          await gate.future;
          return _json({'id': 'v2'});
        }
        if (request.url.path.endsWith('/users/me/venues')) {
          return _json({'venues': []});
        }
        if (request.method == 'PUT') {
          return _json({'activeVenueId': 'v2', 'venueId': 'v1', 'venues': []});
        }
        return _json({});
      }),
    );
    final auth = _auth(client)..user = _owner();

    final first = auth.createAdditionalOwnedVenue(
      name: 'A',
      city: 'SP',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );
    await Future<void>.delayed(Duration.zero);
    final second = await auth.createAdditionalOwnedVenue(
      name: 'B',
      city: 'SP',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );
    expect(second.createError, contains('andamento'));
    gate.complete();
    await first;
    expect(posts, 1);
  });

  test('cadastro OK com falha na seleção preserva venue criado', () async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'POST') {
          return _json({'id': 'v-new'});
        }
        if (request.url.path.endsWith('/users/me/venues')) {
          return _json({
            'venues': [
              {'id': 'v1', 'name': 'A', 'city': 'SP', 'state': 'SP'},
              {'id': 'v-new', 'name': 'N', 'city': 'SP', 'state': 'SP'},
            ],
          });
        }
        if (request.method == 'PUT') {
          return _json({'message': 'Sem permissão'}, 403);
        }
        return _json({});
      }),
    );
    final auth = _auth(client)..user = _owner(activeVenueId: 'v1');
    client.setActiveVenueIdHeader('v1');

    final result = await auth.createAdditionalOwnedVenue(
      name: 'N',
      city: 'SP',
      state: 'SP',
      documentType: 'CPF',
      documentNumber: '123.456.789-09',
    );

    expect(result.created, isTrue);
    expect(result.switchWarning, isNotNull);
    expect(auth.user!.activeVenueId, 'v1');
    expect(auth.user!.venues.any((v) => v.id == 'v-new'), isTrue);
  });

  test('seletor oculto com um local, cadastro adicional ainda permitido', () {
    final auth = _auth(ApiClient(client: MockClient((_) async => _json({}))))
      ..user = _owner();
    expect(auth.showVenueSwitcher, isFalse);
    expect(auth.user!.isVenue, isTrue);
  });

  testWidgets('documento fiscal usa venueId ativo após troca', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(tester.view.reset);

    final requested = <String>[];
    final client = ApiClient(
      client: MockClient((request) async {
        requested.add('${request.method} ${request.url.path}');
        if (request.url.path == '/venues/v2/fiscal-document') {
          return _json({'documentType': 'CPF', 'documentDigits': '11144477735'});
        }
        return _json({}, 404);
      }),
    );
    final auth = _auth(client)
      ..user = _owner(
        activeVenueId: 'v2',
        venues: const [
          OwnedVenueSummary(id: 'v1', name: 'A', city: 'SP', state: 'SP'),
          OwnedVenueSummary(id: 'v2', name: 'B', city: 'SP', state: 'SP'),
        ],
      );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: client),
          ChangeNotifierProvider<AuthController>.value(value: auth),
        ],
        child: MaterialApp(
          home: VenueFiscalDocumentScreen(venueId: auth.managingVenueId!),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      requested.any((r) => r.contains('/venues/v2/fiscal-document')),
      isTrue,
    );
    expect(
      requested.any((r) => r.contains('/venues/v1/fiscal-document')),
      isFalse,
    );
  });

  test('validação local rejeita CPF inválido antes do POST', () {
    expect(BrDocumentValidator.isValidCpf('111'), isFalse);
    expect(BrDocumentValidator.isValidCpf('12345678909'), isTrue);
  });
}
