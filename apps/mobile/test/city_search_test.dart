import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/register_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('cadastro distingue falha da consulta de cidade inexistente', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    var cityCalls = 0;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/locations/cities')) {
          cityCalls += 1;
          if (cityCalls == 1) {
            return http.Response(
              jsonEncode({
                'statusCode': 503,
                'message':
                    'Não foi possível consultar as cidades. Tente novamente.',
              }),
              503,
              headers: const {'content-type': 'application/json'},
            );
          }
          if (req.url.queryParameters['q'] == 'Cidade Inexistente XYZ') {
            return http.Response(
              '[]',
              200,
              headers: const {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode([
              {'id': 3550308, 'name': 'São Paulo', 'uf': 'SP'},
            ]),
            200,
            headers: const {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage());
    auth.bootstrapping = false;

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider<AuthController>.value(value: auth),
        ],
        child: const MaterialApp(home: RegisterScreen()),
      ),
    );
    await tester.pump();

    await tester.enterText(find.byKey(const Key('register-city')), 'São Paulo');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    expect(
      find.text('Não foi possível consultar as cidades. Tente novamente.'),
      findsOneWidget,
    );
    expect(find.text('Nenhuma cidade encontrada.'), findsNothing);

    await tester.tap(find.byKey(const Key('register-city-retry')));
    await tester.pump();
    await tester.pump();

    expect(find.text('São Paulo, SP'), findsOneWidget);
    expect(
      find.text('Não foi possível consultar as cidades. Tente novamente.'),
      findsNothing,
    );

    await tester.enterText(
      find.byKey(const Key('register-city')),
      'Cidade Inexistente XYZ',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    expect(find.text('Nenhuma cidade encontrada.'), findsOneWidget);
    expect(find.byKey(const Key('register-city-retry')), findsNothing);
  });
}
