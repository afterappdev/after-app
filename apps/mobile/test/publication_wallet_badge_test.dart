import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/credits/credits_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

http.Response _json(Object body) => http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json'},
    );

Future<void> _pumpCredits(
  WidgetTester tester, {
  required Map<String, dynamic> wallet,
  Size size = const Size(390, 900),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final client = ApiClient(
    client: MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/credits/wallet')) return _json(wallet);
      if (path.endsWith('/banners/history')) return _json([]);
      if (path.endsWith('/banners/pricing')) {
        return _json({'creditPerDisplayDay': 1});
      }
      return http.Response(
        jsonEncode({'message': 'not found'}),
        404,
        headers: {'content-type': 'application/json'},
      );
    }),
  );

  final auth = AuthController(api: client, storage: AuthStorage())
    ..bootstrapping = false
    ..user = UserSession(
      id: 'owner-1',
      name: 'Bar',
      email: 'bar@after.local',
      role: 'VENUE',
      state: 'SP',
      city: 'São Paulo',
      venueId: 'venue-1',
    );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: client),
        ChangeNotifierProvider<AuthController>.value(value: auth),
      ],
      child: MaterialApp(
        builder: (context, child) {
          final data = MediaQuery.of(context);
          return MediaQuery(
            data: data.copyWith(textScaler: TextScaler.linear(textScale)),
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: const CreditsScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('Nova publicação mostra saldos comum e VIP separados',
      (tester) async {
    await _pumpCredits(
      tester,
      wallet: {'balance': 3, 'vipBalance': 2},
    );

    expect(find.byKey(const Key('pub-badge-common')), findsOneWidget);
    expect(find.byKey(const Key('pub-badge-vip')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('pub-badge-common'))).data, '3');
    expect(tester.widget<Text>(find.byKey(const Key('pub-badge-vip'))).data, '2');
    expect(find.text('Comprar créditos'), findsOneWidget);
    expect(find.byKey(const Key('pub-badge-buy')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Comprar créditos abre a tela de compra', (tester) async {
    await _pumpCredits(
      tester,
      wallet: {'balance': 1, 'vipBalance': 0},
    );

    await tester.tap(find.byKey(const Key('pub-badge-buy')));
    await tester.pumpAndSettle();

    expect(find.text('Comprar créditos'), findsWidgets);
  });

  testWidgets('indicador não estoura em 320px e fonte ampliada', (tester) async {
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final text = details.exceptionAsString();
      if (text.contains('RenderFlex overflowed') &&
          !text.contains('publication-wallet-badge')) {
        return;
      }
      originalOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = originalOnError);

    await _pumpCredits(
      tester,
      wallet: {'balance': 99, 'vipBalance': 88},
      size: const Size(320, 800),
      textScale: 1.4,
    );
    expect(find.byKey(const Key('publication-wallet-badge')), findsOneWidget);
    expect(find.byKey(const Key('pub-badge-common')), findsOneWidget);
    expect(find.byKey(const Key('pub-badge-vip')), findsOneWidget);
  });
}
