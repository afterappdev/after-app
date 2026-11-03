import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/venue_account_screen.dart';
import 'package:after_app/features/profile/venue_fiscal_document_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

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

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('perfil abre Documento fiscal e salva CPF', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    var savedBody = <String, dynamic>{};
    final client = ApiClient(
      client: MockClient((request) async {
        final path = request.url.path;
        if (path == '/venues/venue-1') {
          return _json({'id': 'venue-1', 'name': 'Bar', 'category': 'Bar'});
        }
        if (path == '/venues/venue-1/fiscal-document') {
          if (request.method == 'GET') {
            return _json({
              'documentType': 'CPF',
              'documentDigits': '12345678909',
            });
          }
          if (request.method == 'PUT') {
            savedBody = jsonDecode(request.body) as Map<String, dynamic>;
            return _json({
              'documentType': savedBody['documentType'],
              'documentDigits': savedBody['documentNumber'],
            });
          }
        }
        return _json({'message': 'not found'}, 404);
      }),
    );
    final auth = AuthController(api: client, storage: AuthStorage())
      ..bootstrapping = false
      ..user = _owner();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: client),
          ChangeNotifierProvider<AuthController>.value(value: auth),
        ],
        child: const MaterialApp(home: VenueAccountScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Documento fiscal'), findsOneWidget);
    expect(find.text('Consultar ou atualizar CPF/CNPJ'), findsOneWidget);
    expect(find.byKey(const Key('venue-document-input')), findsNothing);

    await tester.tap(find.text('Documento fiscal'));
    await tester.pumpAndSettle();

    expect(find.byType(VenueFiscalDocumentScreen), findsOneWidget);
    expect(find.textContaining('Documento atual:'), findsOneWidget);
    expect(find.byKey(const Key('venue-document-input')), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('venue-document-input')),
      '123.456.789-09',
    );
    await tester.tap(find.byKey(const Key('venue-document-save')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(savedBody['documentType'], 'CPF');
    expect(savedBody['documentNumber'], '12345678909');
    expect(find.text('Documento salvo com sucesso.'), findsOneWidget);
  });

  testWidgets('formulário dedicado mostra erro de carregamento', (tester) async {
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/fiscal-document')) {
          return _json({'message': 'Falha'}, 500);
        }
        return _json({}, 404);
      }),
    );

    await tester.pumpWidget(
      Provider<ApiClient>.value(
        value: client,
        child: const MaterialApp(
          home: VenueFiscalDocumentScreen(venueId: 'venue-1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('venue-document-load-error')), findsOneWidget);
  });
}
