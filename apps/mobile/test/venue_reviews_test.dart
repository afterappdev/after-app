import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/venue/venue_public_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _venue({String? venueReply, bool isOwner = false}) {
  return {
    'id': 'venue-1',
    'name': 'Refúgio do Chef',
    'category': 'Restaurante',
    'description': 'Restaurante gostoso.',
    'city': 'São Paulo',
    'state': 'SP',
    'isOpen': false,
    'isOwner': isOwner,
    'ownerUserId': 'owner-1',
    'avgRating': 5,
    'reviewCount': 1,
    'photos': [],
    'banners': [],
    'contacts': {},
    'reviews': [
      {
        'id': 'rev-1',
        'userId': 'user-1',
        'rating': 5,
        'testimonial': 'Excelente local.',
        'venueReply': venueReply,
        'createdAt': '2026-09-18T00:00:00.000Z',
        'user': {'id': 'user-1', 'name': 'Pedro Henrique'},
      },
    ],
  };
}

Widget _app({
  required ApiClient api,
  required AuthController auth,
}) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: const MaterialApp(
      home: VenuePublicScreen(venueId: 'venue-1'),
    ),
  );
}

AuthController _venueAuth(ApiClient api, {String? venueId = 'venue-1'}) {
  return AuthController(api: api, storage: AuthStorage())
    ..bootstrapping = false
    ..user = UserSession(
      id: 'owner-1',
      name: 'Chef',
      email: 'chef@after.local',
      role: 'VENUE',
      state: 'SP',
      city: 'São Paulo',
      venueId: venueId,
    );
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

Future<void> _openReviews(WidgetTester tester) async {
  await tester.pump();
  tester.takeException();
  await tester.pump(const Duration(milliseconds: 80));
  tester.takeException();
  await tester.ensureVisible(find.text('Avaliações'));
  await tester.tap(find.text('Avaliações'));
  await tester.pump();
  tester.takeException();
  await tester.pump(const Duration(milliseconds: 80));
  tester.takeException();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('estabelecimento vê botão para responder avaliação', (
    tester,
  ) async {
    await _useSurface(tester);

    final api = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/venues/venue-1')) {
          return http.Response(
            jsonEncode(_venue()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/favorites')) {
          return http.Response('[]', 200);
        }
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(_app(api: api, auth: _venueAuth(api)));
    await _openReviews(tester);

    expect(find.text('Excelente local.'), findsOneWidget);
    expect(find.byKey(const Key('review-reply-field')), findsOneWidget);
    expect(find.byKey(const Key('review-reply-submit')), findsOneWidget);
    expect(find.text('Publicar resposta'), findsOneWidget);
  });

  testWidgets('estabelecimento responde mesmo sem venueId na sessão', (
    tester,
  ) async {
    await _useSurface(tester);

    String? patchedBody;
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'PATCH' &&
            request.url.path.contains('/reviews/rev-1/reply')) {
          patchedBody = request.body;
          return http.Response(
            jsonEncode({
              ..._venue(venueReply: 'Obrigado pela visita!'),
              'avgRating': 5,
              'reviewCount': 1,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/venues/venue-1')) {
          return http.Response(
            jsonEncode(_venue()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/favorites')) {
          return http.Response('[]', 200);
        }
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(
      _app(api: api, auth: _venueAuth(api, venueId: null)),
    );
    await _openReviews(tester);

    await tester.ensureVisible(find.byKey(const Key('review-reply-field')));
    await tester.enterText(
      find.byKey(const Key('review-reply-field')),
      'Obrigado pela visita!',
    );
    await tester.tap(find.byKey(const Key('review-reply-submit')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));

    expect(patchedBody, contains('Obrigado pela visita!'));
    expect(find.text('Obrigado pela visita!'), findsOneWidget);
    expect(find.text('Editar resposta'), findsOneWidget);
  });

  testWidgets('cliente não vê botão de resposta', (tester) async {
    await _useSurface(tester);

    final api = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/venues/venue-1')) {
          return http.Response(
            jsonEncode(_venue()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/favorites')) {
          return http.Response('[]', 200);
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..user = UserSession(
        id: 'user-2',
        name: 'Cliente',
        email: 'cliente@after.local',
        role: 'USER',
        state: 'SP',
        city: 'São Paulo',
      );

    await tester.pumpWidget(_app(api: api, auth: auth));
    await _openReviews(tester);

    expect(find.byKey(const Key('review-reply-submit')), findsNothing);
    expect(find.text('Publicar resposta'), findsNothing);
  });
}
