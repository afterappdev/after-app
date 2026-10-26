import 'package:after_app/core/constants/venue_categories.dart';
import 'package:after_app/features/venue/venue_category_dropdown_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(
    home: Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    ),
  );
}

InputDecoration _decoration() {
  return const InputDecoration(
    labelText: 'Categoria',
    border: OutlineInputBorder(),
  );
}

Finder _menuItemInOverlay(String label) {
  return find.descendant(
    of: find.byType(Overlay),
    matching: find.text(label),
  );
}

Finder get _overlayMenuScrollable {
  return find.descendant(
    of: find.byType(Overlay),
    matching: find.byType(Scrollable),
  );
}

Future<void> _openMenu(WidgetTester tester) async {
  final field = find.byKey(const Key('venue-category-dropdown'));
  await tester.ensureVisible(field);
  await tester.tap(field, warnIfMissed: false);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('maxMenuHeight is half of the safe viewport', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: Size(390, 844),
          padding: EdgeInsets.only(top: 47, bottom: 34),
        ),
        child: Material(
          child: Builder(
            builder: (context) {
              expect(
                VenueCategoryDropdownField.maxMenuHeight(context),
                (844 - 47 - 34) * 0.5,
              );
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
  });

  testWidgets('opens menu, scrolls categories, selects and closes', (
    tester,
  ) async {
    String? selected;

    await tester.pumpWidget(
      _wrap(
        VenueCategoryDropdownField(
          value: selected,
          decoration: _decoration(),
          style: const TextStyle(fontSize: 13),
          hintStyle: const TextStyle(color: Colors.grey),
          onChanged: (value) => selected = value,
        ),
      ),
    );

    await _openMenu(tester);

    expect(find.byType(Scrollable), findsWidgets);

    final menuHeight = VenueCategoryDropdownField.maxMenuHeight(
      tester.element(find.byKey(const Key('venue-category-dropdown'))),
    );
    expect(menuHeight, lessThan(844 * 0.51));

    const pick = '🍷 Adegas e Wine Bars';
    await tester.tap(_menuItemInOverlay(pick));
    await tester.pumpAndSettle();

    expect(selected, pick);
    expect(find.text(pick), findsOneWidget);
  });

  testWidgets('closes without changing selection via back and outside tap', (
    tester,
  ) async {
    const initial = '🍻 Bares e Botecos';
    String? selected = initial;

    await tester.pumpWidget(
      _wrap(
        VenueCategoryDropdownField(
          value: selected,
          decoration: _decoration(),
          style: const TextStyle(fontSize: 13),
          hintStyle: const TextStyle(color: Colors.grey),
          onChanged: (value) => selected = value,
          optionsSeed: initial,
        ),
      ),
    );

    await _openMenu(tester);
    expect(_overlayMenuScrollable, findsOneWidget);

    await tester.tapAt(const Offset(8, 8));
    await tester.pumpAndSettle();
    expect(selected, initial);
    expect(_overlayMenuScrollable, findsNothing);

    await _openMenu(tester);
    expect(_overlayMenuScrollable, findsOneWidget);
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(selected, initial);
    expect(_overlayMenuScrollable, findsNothing);
  });

  testWidgets('Escape closes the menu on web-style key events', (tester) async {
    const initial = '🍻 Bares e Botecos';
    String? selected = initial;

    await tester.pumpWidget(
      _wrap(
        VenueCategoryDropdownField(
          value: selected,
          decoration: _decoration(),
          style: const TextStyle(fontSize: 13),
          hintStyle: const TextStyle(color: Colors.grey),
          onChanged: (value) => selected = value,
          optionsSeed: initial,
        ),
      ),
    );

    await _openMenu(tester);
    expect(_overlayMenuScrollable, findsOneWidget);

    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();

    expect(selected, initial);
    expect(_overlayMenuScrollable, findsNothing);
  });

  testWidgets('menu scrolls to categories below the fold', (tester) async {
    await tester.pumpWidget(
      _wrap(
        VenueCategoryDropdownField(
          value: null,
          decoration: _decoration(),
          style: const TextStyle(fontSize: 13),
          hintStyle: const TextStyle(color: Colors.grey),
          onChanged: (_) {},
        ),
      ),
    );

    await _openMenu(tester);

    const deepCategory = '🍣 Culinária Asiática';
    final menuScrollable = find.descendant(
      of: find.byType(Overlay),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      _menuItemInOverlay(deepCategory),
      120,
      scrollable: menuScrollable,
    );
    expect(_menuItemInOverlay(deepCategory), findsOneWidget);
    expect(VenueCategories.all.length, greaterThan(10));
  });
}
