import 'dart:async';

import 'package:after_app/features/credits/coupon_redeem_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('aplicar cupom mostra sucesso e bloqueia duplo toque', (tester) async {
    final completer = Completer<int>();
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CouponRedeemSection(
            onRedeem: (code) {
              calls += 1;
              expect(code, 'AFTER2');
              return completer.future;
            },
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'AFTER2');
    await tester.tap(find.text('Aplicar'));
    await tester.pump();
    expect(calls, 1);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);

    completer.complete(2);
    await tester.pumpAndSettle();
    expect(find.text('Cupom aplicado! Você recebeu 2 crédito(s).'), findsOneWidget);
  });

  testWidgets('erro de cupom mostra a mensagem e não fica carregando', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CouponRedeemSection(
            onRedeem: (_) async => throw CouponRedeemException('Este cupom expirou.'),
          ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'VELHO');
    await tester.tap(find.text('Aplicar'));
    await tester.pumpAndSettle();
    expect(find.text('Este cupom expirou.'), findsOneWidget);
    expect(find.text('Aplicar'), findsOneWidget);
  });
}
