import 'package:after_app/features/home/venue_filter_sheet_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('botão fica acima da barra nativa e o conteúdo rola', (tester) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 48);
    tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 48);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);

    await tester.pumpWidget(
      const MaterialApp(
        home: VenueFilterSheetLayout(
          child: SingleChildScrollView(
            child: Column(
              children: [
                SizedBox(height: 900, child: Text('opções')),
                SizedBox(
                  height: 48,
                  child: Text('Aplicar filtros'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.text('Aplicar filtros'),
      200,
      scrollable: find.byType(Scrollable),
    );
    final button = tester.getRect(find.text('Aplicar filtros'));
    expect(button.bottom, lessThanOrEqualTo(480 - 48));
    expect(find.text('opções'), findsOneWidget);
  });

  testWidgets('teclado aberto entra no espaço reservado', (tester) async {
    const media = MediaQueryData(
      size: Size(320, 640),
      padding: EdgeInsets.only(bottom: 0),
      viewPadding: EdgeInsets.only(bottom: 48),
      viewInsets: EdgeInsets.only(bottom: 280),
    );
    expect(VenueFilterSheetLayout.bottomObstacle(media), 280);
  });
}
