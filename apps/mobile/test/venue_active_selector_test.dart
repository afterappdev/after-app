import 'dart:convert';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/venue_active_selector.dart';
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

http.Response _json(Object body, {int status = 200}) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

UserSession _owner({String activeVenueId = 'v1'}) {
  return UserSession(
    id: 'owner-1',
    name: 'Owner',
    email: 'owner@after.local',
    role: 'VENUE',
    state: 'SP',
    city: 'São Paulo',
    venueId: 'v1',
    activeVenueId: activeVenueId,
    venues: const [
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

Future<AuthController> _authWithClient(MockClient client) async {
  SharedPreferences.setMockInitialValues({AuthStorage.tokenKey: 'token'});
  final api = ApiClient(client: client);
  api.setToken('token');
  api.setActiveVenueIdHeader('v1');
  final auth = AuthController(
    api: api,
    storage: AuthStorage(),
    googleSession: _NoOpGoogleSession(),
  )
    ..bootstrapping = false
    ..user = _owner();
  return auth;
}

Future<void> _pumpSelector(WidgetTester tester, AuthController auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthController>.value(
      value: auth,
      child: const MaterialApp(
        home: Scaffold(
          body: VenueActiveSelector(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Simula [VenueAccountScreen]: reconstrói o seletor quando o escopo muda.
Future<void> _pumpWithParentRebuild(
  WidgetTester tester,
  AuthController auth,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthController>.value(
      value: auth,
      child: MaterialApp(
        home: _VenueScopeHost(auth: auth),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _VenueScopeHost extends StatefulWidget {
  const _VenueScopeHost({required this.auth});

  final AuthController auth;

  @override
  State<_VenueScopeHost> createState() => _VenueScopeHostState();
}

class _VenueScopeHostState extends State<_VenueScopeHost> {
  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_onAuthChanged);
  }

  @override
  void dispose() {
    widget.auth.removeListener(_onAuthChanged);
    super.dispose();
  }

  void _onAuthChanged() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    return Scaffold(
      body: Column(
        children: [
          Text('gen-${auth.venueDataGeneration}'),
          VenueActiveSelector(
            key: ValueKey(
              'selector-${auth.venueDataGeneration}-${auth.managingVenueId}',
            ),
          ),
        ],
      ),
    );
  }
}

Finder _barBInSheet() {
  return find.descendant(
    of: find.ancestor(
      of: find.text('Seus estabelecimentos'),
      matching: find.byType(SafeArea),
    ),
    matching: find.text('Bar B'),
  );
}

Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.unfold_more_rounded));
  await tester.pumpAndSettle();
  expect(find.text('Seus estabelecimentos'), findsOneWidget);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('fecha o bottom sheet após troca bem-sucedida', (tester) async {
    var putCount = 0;
    final auth = await _authWithClient(
      MockClient((request) async {
        if (request.method == 'PUT' &&
            request.url.path.endsWith('/users/me/active-venue')) {
          putCount++;
          return _json({
            'venueId': 'v1',
            'activeVenueId': 'v2',
            'venues': [
              {'id': 'v1', 'name': 'Bar A', 'city': 'São Paulo', 'state': 'SP'},
              {'id': 'v2', 'name': 'Bar B', 'city': 'Campinas', 'state': 'SP'},
            ],
          });
        }
        return _json({});
      }),
    );

    await _pumpSelector(tester, auth);
    await _openSheet(tester);

    await tester.tap(_barBInSheet());
    await tester.pumpAndSettle();

    expect(find.text('Seus estabelecimentos'), findsNothing);
    expect(putCount, 1);
    expect(auth.user!.activeVenueId, 'v2');
    expect(find.text('Bar B'), findsWidgets);
  });

  testWidgets(
    'fecha modal após troca mesmo com rebuild do seletor na tela pai',
    (tester) async {
      var putCount = 0;
      final auth = await _authWithClient(
        MockClient((request) async {
          if (request.method == 'PUT' &&
              request.url.path.endsWith('/users/me/active-venue')) {
            putCount++;
            await Future<void>.delayed(const Duration(milliseconds: 30));
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
          return _json({});
        }),
      );

      await _pumpWithParentRebuild(tester, auth);
      await _openSheet(tester);

      expect(find.byIcon(Icons.check_circle), findsOneWidget);

      await tester.tap(_barBInSheet());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pumpAndSettle();

      expect(find.text('Seus estabelecimentos'), findsNothing);
      expect(putCount, 1);
      expect(auth.user!.activeVenueId, 'v2');
      expect(auth.user!.implicitVenueHeaderId, 'v2');

      await tester.tap(find.byIcon(Icons.unfold_more_rounded));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      expect(find.text('Bar B'), findsWidgets);
    },
  );

  testWidgets('selecionar estabelecimento já ativo fecha sem chamar API', (
    tester,
  ) async {
    var putCount = 0;
    final auth = await _authWithClient(
      MockClient((request) async {
        if (request.method == 'PUT') putCount++;
        return _json({});
      }),
    );

    await _pumpSelector(tester, auth);
    await _openSheet(tester);

    await tester.tap(find.byIcon(Icons.check_circle));
    await tester.pumpAndSettle();

    expect(find.text('Seus estabelecimentos'), findsNothing);
    expect(putCount, 0);
    expect(auth.user!.activeVenueId, 'v1');
  });

  testWidgets('falha na troca fecha o sheet e exibe erro', (tester) async {
    final auth = await _authWithClient(
      MockClient((request) async {
        if (request.method == 'PUT') {
          return _json({'message': 'Sem permissão'}, status: 403);
        }
        return _json({});
      }),
    );

    await _pumpSelector(tester, auth);
    await _openSheet(tester);

    await tester.tap(_barBInSheet());
    await tester.pumpAndSettle();

    expect(find.text('Seus estabelecimentos'), findsNothing);
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(auth.user!.activeVenueId, 'v1');
  });

  testWidgets('não dispara segunda troca enquanto switchingActiveVenue', (
    tester,
  ) async {
    var putCount = 0;
    final auth = await _authWithClient(
      MockClient((request) async {
        if (request.method == 'PUT' &&
            request.url.path.endsWith('/users/me/active-venue')) {
          putCount++;
          await Future<void>.delayed(const Duration(milliseconds: 100));
          return _json({
            'activeVenueId': 'v2',
            'venueId': 'v1',
            'venues': [
              {'id': 'v1', 'name': 'Bar A', 'city': 'São Paulo', 'state': 'SP'},
              {'id': 'v2', 'name': 'Bar B', 'city': 'Campinas', 'state': 'SP'},
            ],
          });
        }
        return _json({});
      }),
    );

    await _pumpSelector(tester, auth);
    await _openSheet(tester);

    await tester.tap(_barBInSheet());
    await tester.pump();
    await tester.tap(_barBInSheet());
    await tester.pumpAndSettle();

    expect(putCount, 1);
    expect(find.text('Seus estabelecimentos'), findsNothing);
  });
}
