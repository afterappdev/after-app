import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/venue_account_screen.dart';
import 'package:after_app/features/venue/add_venue_screen.dart';
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

Future<void> _pumpVenueAccount(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final client = ApiClient(
    client: MockClient((request) async {
      if (request.url.path == '/venues/v1') {
        return _json({'id': 'v1', 'name': 'Bar', 'category': 'Bar'});
      }
      if (request.url.path.endsWith('/users/me/venues')) {
        return _json({
          'venues': [
            {'id': 'v1', 'name': 'Bar', 'city': 'SP', 'state': 'SP'},
            {'id': 'v2', 'name': 'Filial', 'city': 'SP', 'state': 'SP'},
          ],
        });
      }
      return _json({}, 404);
    }),
  );
  final auth = AuthController(
    api: client,
    storage: AuthStorage(),
    googleSession: _NoOpGoogleSession(),
  )
    ..bootstrapping = false
    ..user = UserSession(
      id: 'o',
      name: 'O',
      email: 'o@after.local',
      role: 'VENUE',
      state: 'SP',
      city: 'SP',
      venueId: 'v1',
      activeVenueId: 'v1',
      venues: const [
        OwnedVenueSummary(id: 'v1', name: 'Bar', city: 'SP', state: 'SP'),
        OwnedVenueSummary(id: 'v2', name: 'Filial', city: 'SP', state: 'SP'),
      ],
    );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: client),
        ChangeNotifierProvider<AuthController>.value(value: auth),
      ],
      child: const MaterialApp(home: VenueAccountScreen()),
    ),
  );
  for (var i = 0; i < 30; i++) {
    await tester.pump(const Duration(milliseconds: 40));
    if (find.byKey(const Key('venue-add-establishment')).evaluate().isNotEmpty) {
      break;
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('VenueAccountScreen 390x900 sem overflow', (tester) async {
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed')) {
        fail(details.exceptionAsString());
      }
      FlutterError.presentError(details);
    };
    addTearDown(() => FlutterError.onError = FlutterError.presentError);

    await _pumpVenueAccount(tester, const Size(390, 900));
    expect(find.byKey(const Key('venue-add-establishment')), findsOneWidget);
    await tester.pump();
  });

  testWidgets('VenueAccountScreen 390x640 com scroll', (tester) async {
    await _pumpVenueAccount(tester, const Size(390, 640));
    expect(find.byKey(const Key('venue-add-establishment')), findsOneWidget);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -200));
    await tester.pump();
    expect(find.text('Adicionar estabelecimento'), findsOneWidget);
  });

  testWidgets('AddVenueScreen 390x640 permite scroll até o botão', (tester) async {
    tester.view.physicalSize = const Size(390, 640);
    addTearDown(tester.view.reset);

    final auth = AuthController(
      api: ApiClient(client: MockClient((_) async => _json({}))),
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    )
      ..bootstrapping = false
      ..user = UserSession(
        id: 'o',
        name: 'O',
        email: 'o@after.local',
        role: 'VENUE',
        state: 'SP',
        city: 'SP',
        venueId: 'v1',
      );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: auth.api),
          ChangeNotifierProvider<AuthController>.value(value: auth),
        ],
        child: const MaterialApp(home: AddVenueScreen()),
      ),
    );
    await tester.pump();
    await tester.scrollUntilVisible(
      find.byKey(const Key('add-venue-submit')),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Cadastrar estabelecimento'), findsOneWidget);
  });
}
