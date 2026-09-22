import 'dart:convert';

import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/moderation/report_reasons.dart';
import 'package:after_app/features/moderation/report_sheet.dart';
import 'package:after_app/features/profile/blocked_venues_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

Widget _app({
  required ApiClient api,
  required Widget home,
}) {
  return Provider.value(
    value: api,
    child: MaterialApp(home: home),
  );
}

void main() {
  Future<void> useTallSurface(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets('abre denúncia, seleciona motivo e envia', (tester) async {
    await useTallSurface(tester);
    ReportReason? sentReason;
    String? sentDescription;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReportSheet(
            onSubmit: (reason, description) async {
              sentReason = reason;
              sentDescription = description;
            },
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('report-sheet-title')), findsOneWidget);
    await tester.tap(find.byKey(const Key('report-submit')));
    await tester.pump();
    expect(find.text('Escolha um motivo para continuar.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('report-reason-SPAM')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-submit')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(sentReason, ReportReason.spam);
    expect(sentDescription, isNull);
  });

  testWidgets('motivo Outro mostra descrição limitada', (tester) async {
    await useTallSurface(tester);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ReportSheet(
            onSubmit: _noopSubmit,
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('report-description')), findsNothing);
    await tester.tap(find.byKey(const Key('report-reason-OTHER')));
    await tester.pump();
    expect(find.byKey(const Key('report-description')), findsOneWidget);
  });

  testWidgets('denúncia mostra erro da API', (tester) async {
    await useTallSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReportSheet(
            onSubmit: (_, _) async {
              throw ApiException('Você já denunciou este conteúdo.');
            },
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('report-reason-SPAM')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-submit')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('report-error')), findsOneWidget);
    expect(find.text('Você já denunciou este conteúdo.'), findsOneWidget);
  });

  testWidgets('tela de bloqueados vazia', (tester) async {
    final api = ApiClient(
      client: MockClient((request) async {
        expect(request.url.path, contains('/users/me/blocked-venues'));
        return http.Response('[]', 200);
      }),
    );
    await tester.pumpWidget(
      _app(api: api, home: const BlockedVenuesScreen()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('blocked-venues-empty')), findsOneWidget);
  });

  testWidgets('lista e desbloqueia estabelecimento', (tester) async {
    var deleted = false;
    final api = ApiClient(
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return http.Response(
            jsonEncode([
              {
                'id': 'b1',
                'venueId': 'venue-1',
                'venue': {
                  'id': 'venue-1',
                  'name': 'Bar Central',
                  'logoUrl': null,
                },
              },
            ]),
            200,
          );
        }
        if (request.method == 'DELETE') {
          deleted = true;
          return http.Response(jsonEncode({'ok': true}), 200);
        }
        return http.Response('unexpected', 500);
      }),
    );
    await tester.pumpWidget(
      _app(api: api, home: const BlockedVenuesScreen()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Bar Central'), findsOneWidget);

    await tester.tap(find.byKey(const Key('unblock-venue-venue-1')));
    await tester.pumpAndSettle();
    expect(find.text('Desbloquear estabelecimento?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('unblock-confirm')));
    await tester.pumpAndSettle();
    expect(deleted, isTrue);
    expect(find.byKey(const Key('blocked-venues-empty')), findsOneWidget);
  });

  testWidgets('erro na tela de bloqueados', (tester) async {
    final api = ApiClient(
      client: MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'Não autorizado'}),
          401,
        );
      }),
    );
    await tester.pumpWidget(
      _app(api: api, home: const BlockedVenuesScreen()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('blocked-venues-error')), findsOneWidget);
  });
}

Future<void> _noopSubmit(ReportReason reason, String? description) async {}
