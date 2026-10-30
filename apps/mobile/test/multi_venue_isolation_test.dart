import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/owned_venue_summary.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/credits/credits_screen.dart';
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('runWithActiveVenueHeader fixa header só durante a ação', () async {
    final seen = <String?>[];
    final client = ApiClient(
      client: MockClient((request) async {
        seen.add(request.headers[kActiveVenueIdHeader]);
        return _json({'balance': 1, 'vipBalance': 0});
      }),
    );
    client.setActiveVenueIdHeader('v1');

    await client.runWithActiveVenueHeader('v-checkout', () async {
      await client.get('/credits/wallet');
      await client.post('/credits/pix/create', body: {'packageKey': 'unit_1'});
    });

    expect(seen, ['v-checkout', 'v-checkout']);
    expect(client.activeVenueIdHeader, 'v1');
  });

  test('upload de banner usa header congelado no início da operação', () async {
    final headersAtUpload = <String>[];
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/uploads')) {
          headersAtUpload.add(request.headers[kActiveVenueIdHeader] ?? '');
          return _json({'url': 'https://cdn/banner.jpg'});
        }
        return _json({});
      }),
    );
    client.setActiveVenueIdHeader('venue-a');

    await client.runWithActiveVenueHeader('venue-a', () {
      return client.uploadImage(
        bytes: Uint8List.fromList([0xFF, 0xD8, 0xFF]),
        filename: 'b.jpg',
        mimeType: 'image/jpeg',
      );
    });

    client.setActiveVenueIdHeader('venue-b');
    expect(headersAtUpload, ['venue-a']);
    expect(client.activeVenueIdHeader, 'venue-b');
  });

  test('PIX create usa header congelado no checkout', () async {
    final headersAtCreate = <String>[];
    final client = ApiClient(
      client: MockClient((request) async {
        if (request.url.path.endsWith('/credits/pix/create')) {
          headersAtCreate.add(request.headers[kActiveVenueIdHeader] ?? '');
        }
        return _json({
          'purchaseId': 'p1',
          'status': 'PENDING',
          'qrCodeText': '000',
        });
      }),
    );
    client.setActiveVenueIdHeader('venue-a');

    await client.runWithActiveVenueHeader('venue-a', () {
      return client.post(
        '/credits/pix/create',
        body: {'packageKey': 'unit_1'},
      );
    });

    client.setActiveVenueIdHeader('venue-b');
    expect(headersAtCreate, ['venue-a']);
    expect(client.activeVenueIdHeader, 'venue-b');
  });

  testWidgets('CreditsScreen descarta saldo atrasado após troca de estabelecimento',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    addTearDown(tester.view.reset);

    final walletGate = Completer<void>();
    var walletCalls = 0;
    final client = ApiClient(
      client: MockClient((request) async {
        final path = request.url.path;
        if (path.endsWith('/credits/wallet')) {
          walletCalls += 1;
          if (walletCalls == 1) {
            await walletGate.future;
            return _json({'balance': 99, 'vipBalance': 0});
          }
          return _json({'balance': 2, 'vipBalance': 1});
        }
        if (path.endsWith('/banners/history')) {
          return _json([]);
        }
        if (path.endsWith('/banners/pricing')) {
          return _json({'creditPerDisplayDay': 1, 'vipCreditPerDisplayDay': 1});
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
          OwnedVenueSummary(id: 'v1', name: 'A', city: 'SP', state: 'SP'),
          OwnedVenueSummary(id: 'v2', name: 'B', city: 'SP', state: 'SP'),
        ],
      );
    client.setActiveVenueIdHeader('v1');

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: client),
          ChangeNotifierProvider<AuthController>.value(value: auth),
        ],
        child: const MaterialApp(home: CreditsScreen()),
      ),
    );
    await tester.pump();

    auth.venueDataGeneration++;
    client.setActiveVenueIdHeader('v2');
    auth.notifyListeners();
    await tester.pump();

    walletGate.complete();
    await tester.pump();
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.text('99'), findsNothing);
    expect(walletCalls, greaterThanOrEqualTo(2));
  });
}
