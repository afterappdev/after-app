import 'package:after_app/features/credits/credits_ui.dart';
import 'package:after_app/features/credits/publication_push_limits.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('título single-line mostra contador 0/20', (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CreditsField(
            label: 'Título',
            controller: controller,
            maxLength: PublicationPushLimits.titleMax,
          ),
        ),
      ),
    );
    expect(find.text('0/${PublicationPushLimits.titleMax}'), findsOneWidget);
  });
}