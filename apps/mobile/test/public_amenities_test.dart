import 'package:after_app/features/venue/venue_public_amenities.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('página pública mostra só comodidades marcadas e a entrada separada', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              VenueOwnedAmenities(
                contacts: {
                  'hasLiveMusic': true,
                  'hasWifi': true,
                  'isPetFriendly': false,
                  'hasCoverCharge': true,
                  'coverCharge': '25,00',
                },
              ),
              VenueEntryLine(
                contacts: {
                  'hasCoverCharge': true,
                  'coverCharge': '25,00',
                },
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Música ao vivo'), findsOneWidget);
    expect(find.text('Wi-Fi'), findsOneWidget);
    expect(find.text('Pet friendly'), findsNothing);
    expect(find.text('Custo de entrada'), findsNothing);
    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.text('Entrada: R\$ 25,00'), findsOneWidget);
  });

  testWidgets('sem comodidades mostra estado vazio e entrada gratuita', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              VenueOwnedAmenities(contacts: {}),
              VenueEntryLine(contacts: {}),
            ],
          ),
        ),
      ),
    );

    expect(find.text('Nenhuma comodidade informada.'), findsOneWidget);
    expect(find.text('Entrada gratuita'), findsOneWidget);
  });
}
