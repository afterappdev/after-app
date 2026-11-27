import 'package:after_app/core/constants/venue_music_styles.dart';
import 'package:after_app/features/venue/venue_music_style_dropdown_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('catalog keeps the popular styles', () {
    expect(VenueMusicStyles.all, contains('Sertanejo'));
    expect(VenueMusicStyles.all, contains('Funk'));
    expect(VenueMusicStyles.selectionFor(' Funk '), 'Funk');
    expect(VenueMusicStyles.selectionFor('Ópera'), isNull);
    expect(
      venueCategoryWithStyle('🍻 Bares e Botecos', 'Pagode'),
      '🍻 Bares e Botecos · Pagode',
    );
  });

  testWidgets('dropdown offers a popular style', (tester) async {
    String? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return VenueMusicStyleDropdownField(
                value: selected,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                style: const TextStyle(fontSize: 13),
                hintStyle: const TextStyle(color: Colors.grey),
                onChanged: (value) => setState(() => selected = value),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('venue-music-style-dropdown')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Axé').last);
    await tester.pumpAndSettle();

    expect(selected, 'Axé');
    expect(find.text('Axé'), findsOneWidget);
  });
}
