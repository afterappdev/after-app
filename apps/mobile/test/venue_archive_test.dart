import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/account_recovery_screen.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/login_screen.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/venue_archive_dialog.dart';

class _NoOpGoogleSession implements GoogleSessionCleaner {
  @override
  Future<void> disconnect() async {}

  @override
  Future<void> signOut() async {}
}

Widget _wrap(Widget child, AuthController auth, ApiClient api) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(home: child),
  );
}

UserSession _venueUser({List<OwnedVenueSummary>? venues}) {
  final list = venues ??
      [
        OwnedVenueSummary(
          id: 'v1',
          name: 'Bar A',
          city: 'Campinas',
          state: 'SP',
        ),
        OwnedVenueSummary(
          id: 'v2',
          name: 'Bar B',
          city: 'Campinas',
          state: 'SP',
        ),
      ];
  return UserSession(
    id: 'u1',
    name: 'Owner',
    email: 'owner@after.local',
    role: 'VENUE',
    state: 'SP',
    city: 'Campinas',
    venueId: list.first.id,
    activeVenueId: list.first.id,
    venues: list,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('archiveOwnedVenue atualiza sessão e activeVenueId', () async {
    var archiveCalled = false;
    final client = MockClient((req) async {
      if (req.method == 'POST' &&
          req.url.path.endsWith('/users/me/venues/v1/archive')) {
        archiveCalled = true;
        return http.Response(
          jsonEncode({
            'ok': true,
            'venueId': 'v2',
            'activeVenueId': 'v2',
            'venues': [
              {
                'id': 'v2',
                'name': 'Bar B',
                'city': 'Campinas',
                'state': 'SP',
                'logoUrl': null,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.user = _venueUser();
    api.setToken('access');

    final err = await auth.archiveOwnedVenue('v1');
    expect(err, isNull);
    expect(archiveCalled, isTrue);
    expect(auth.user?.venues.length, 1);
    expect(auth.user?.activeVenueId, 'v2');
    expect(auth.managingVenueId, 'v2');
  });

  testWidgets('LoginScreen exibe recuperação após login pendente', (tester) async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(
          jsonEncode({
            'accountPendingDeletion': true,
            'recoveryToken': 'recovery-jwt',
            'deletionStatus': {
              'accountStatus': 'PENDING_DELETION',
              'remainingSeconds': 86400,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );

    await tester.pumpWidget(_wrap(const LoginScreen(), auth, api));
    await tester.enterText(find.byType(TextField).first, 'a@b.com');
    await tester.enterText(find.byType(TextField).last, 'secret1');
    await tester.tap(find.text('Entrar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(AccountRecoveryScreen), findsOneWidget);
    expect(find.text('Recuperar minha conta'), findsOneWidget);
  });

  testWidgets('diálogo de exclusão mostra nome do estabelecimento',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return ElevatedButton(
              onPressed: () async {
                await confirmVenueArchive(
                  context,
                  venueName: 'Boteco Central',
                );
              },
              child: const Text('open'),
            );
          },
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Boteco Central'), findsOneWidget);
    expect(find.byKey(const Key('venue-archive-confirm')), findsOneWidget);
  });
}
