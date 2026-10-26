import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/credits/credits_screen.dart';
import 'package:after_app/features/credits/credits_ui.dart';
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
        return _json({
          'creditPerDisplayDay': 1,
          'vipCreditPerDisplayDay': 1,
        });
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

  testWidgets('card compacto e alinhado à direita no cabeçalho', (tester) async {
    const screenWidth = 390.0;
    const horizontalPadding = 20.0;

    await _pumpCredits(
      tester,
      wallet: {'balance': 3, 'vipBalance': 2},
      size: const Size(screenWidth, 900),
    );

    final badge = tester.getRect(find.byKey(const Key('publication-wallet-badge')));
    final contentWidth = screenWidth - horizontalPadding * 2;

    expect(badge.width, lessThan(contentWidth * 0.55));
    expect(badge.width, greaterThan(130));
    expect(badge.width, lessThan(210));
    expect(badge.right, closeTo(screenWidth - horizontalPadding, 1));

    final logo = tester.getRect(find.byType(Image).first);
    expect(logo.right, lessThan(badge.left - 8));
  });

  testWidgets('card isolado usa largura intrínseca ao conteúdo', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: PublicationWalletBadge(
              commonBalance: 3,
              vipBalance: 2,
              onBuy: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final badge = tester.getRect(find.byKey(const Key('publication-wallet-badge')));
    expect(badge.width, greaterThan(130));
    expect(badge.width, lessThan(210));
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
    expect(tester.takeException(), isNull);

    final badge = tester.getRect(find.byKey(const Key('publication-wallet-badge')));
    expect(badge.width, lessThan(280));
  });

  testWidgets('area de upload nao estoura em 320px com fonte ampliada', (
    tester,
  ) async {
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final text = details.exceptionAsString();
      if (text.contains('RenderFlex overflowed')) {
        fail('Upload area overflow: $text');
      }
      originalOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = originalOnError);

    await _pumpCredits(
      tester,
      wallet: {'balance': 3, 'vipBalance': 2},
      size: const Size(320, 800),
      textScale: 1.4,
    );

    expect(find.text('Toque para selecionar uma imagem'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final width in [360.0, 390.0]) {
    for (final scale in [1.0, 1.4]) {
      testWidgets(
        'area de upload nao estoura em ${width.toInt()}px textScale $scale',
        (tester) async {
          final originalOnError = FlutterError.onError;
          FlutterError.onError = (details) {
            final text = details.exceptionAsString();
            if (text.contains('RenderFlex overflowed')) {
              fail('Upload area overflow: $text');
            }
            originalOnError?.call(details);
          };
          addTearDown(() => FlutterError.onError = originalOnError);

          await _pumpCredits(
            tester,
            wallet: {'balance': 3, 'vipBalance': 2},
            size: Size(width, 900),
            textScale: scale,
          );

          expect(find.text('Toque para selecionar uma imagem'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('320px com fonte ampliada mantém card à direita', (tester) async {
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
      wallet: {'balance': 3, 'vipBalance': 2},
      size: const Size(320, 800),
      textScale: 1.4,
    );

    final badge = tester.getRect(find.byKey(const Key('publication-wallet-badge')));
    expect(badge.right, closeTo(320 - 20, 1));
    expect(badge.width, lessThan(220));
  });

  testWidgets('seletor COMUM/VIP aparece e COMUM vem selecionado', (tester) async {
    await _pumpCredits(
      tester,
      wallet: {'balance': 2, 'vipBalance': 1},
    );

    expect(find.byKey(const Key('pub-plan-common')), findsOneWidget);
    expect(find.byKey(const Key('pub-plan-vip')), findsOneWidget);
    expect(find.text('Saldo comum: 2'), findsOneWidget);
    expect(find.text('Saldo VIP: 1'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
  });

  testWidgets('selecionar VIP destaca plano roxo', (tester) async {
    await _pumpCredits(
      tester,
      wallet: {'balance': 0, 'vipBalance': 3},
    );

    await tester.tap(find.byKey(const Key('pub-plan-vip')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Destaque na Home'), findsWidgets);
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
  });
}
