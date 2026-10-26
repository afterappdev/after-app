import 'package:after_app/core/constants/venue_categories.dart';
import 'package:after_app/features/home/venue_filter_sheet_layout.dart';
import 'package:after_app/features/venue/venue_category_dropdown_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

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

Future<void> _openCategoryMenu(WidgetTester tester) async {
  final field = find.byKey(const Key('venue-home-category-filter'));
  await tester.ensureVisible(field);
  await tester.tap(field, warnIfMissed: false);
  await tester.pumpAndSettle();
  if (_overlayMenuScrollable.evaluate().isEmpty) {
    final arrow = find.descendant(
      of: field,
      matching: find.byIcon(Icons.arrow_drop_down),
    );
    if (arrow.evaluate().isNotEmpty) {
      await tester.tap(arrow);
      await tester.pumpAndSettle();
    }
  }
}

Widget _filterSheetHarness({
  required String? category,
  required ValueChanged<String?> onCategoryChanged,
  VoidCallback? onApply,
  VoidCallback? onCloseHeader,
}) {
  return MaterialApp(
    home: Builder(
      builder: (context) {
        return Scaffold(
          body: Center(
            child: ElevatedButton(
              key: const Key('open-filter-sheet'),
              onPressed: () {
                showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.white,
                  builder: (sheetContext) {
                    return VenueFilterSheetLayout(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                const Expanded(
                                  child: Text('Filtrar locais'),
                                ),
                                IconButton(
                                  key: const Key('venue-filter-sheet-close'),
                                  onPressed: () {
                                    onCloseHeader?.call();
                                    Navigator.pop(sheetContext);
                                  },
                                  icon: const Icon(Icons.close),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            VenueHomeCategoryFilterDropdown(
                              value: category,
                              onChanged: onCategoryChanged,
                            ),
                            const SizedBox(height: 24),
                            ElevatedButton(
                              key: const Key('apply-venue-filters'),
                              onPressed: () {
                                onApply?.call();
                                Navigator.pop(sheetContext);
                              },
                              child: const Text('Aplicar filtros'),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
              child: const Text('Abrir filtros'),
            ),
          ),
        );
      },
    ),
  );
}

void main() {
  testWidgets('menu height stays within half of the safe viewport', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 48);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);

    String? category;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: VenueHomeCategoryFilterDropdown(
            value: category,
            onChanged: (v) => category = v,
          ),
        ),
      ),
    );

    await _openCategoryMenu(tester);
    expect(_overlayMenuScrollable, findsOneWidget);

    final maxHeight = VenueCategoryDropdownField.maxMenuHeight(
      tester.element(find.byKey(const Key('venue-home-category-filter'))),
    );
    expect(maxHeight, (480 - 24 - 48) * 0.5);
    expect(maxHeight, lessThan(480 * 0.55));
  });

  testWidgets('selects a category from the menu', (tester) async {
    String? category;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return VenueHomeCategoryFilterDropdown(
                value: category,
                onChanged: (v) => setState(() => category = v),
              );
            },
          ),
        ),
      ),
    );

    await _openCategoryMenu(tester);
    const pick = '🍷 Adegas e Wine Bars';
    await tester.tap(_menuItemInOverlay(pick));
    await tester.pumpAndSettle();
    expect(category, pick);
  });

  testWidgets('menu lists Todas as categorias and selecting it keeps filter open', (
    tester,
  ) async {
    String? category;
    const allLabel = VenueHomeCategoryFilterDropdown.allCategoriesLabel;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return VenueHomeCategoryFilterDropdown(
                value: category,
                onChanged: (v) => setState(() => category = v),
              );
            },
          ),
        ),
      ),
    );

    await _openCategoryMenu(tester);
    expect(_menuItemInOverlay(allLabel), findsWidgets);
    await tester.tap(_menuItemInOverlay(allLabel).first);
    await tester.pumpAndSettle();
    expect(category, isNull);
  });

  testWidgets('parent can clear a chosen category', (tester) async {
    const pick = '🍷 Adegas e Wine Bars';
    String? category = pick;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return Column(
                children: [
                  VenueHomeCategoryFilterDropdown(
                    value: category,
                    onChanged: (v) => setState(() => category = v),
                  ),
                  TextButton(
                    key: const Key('clear-category-filter'),
                    onPressed: () => setState(() => category = null),
                    child: const Text('Limpar categoria'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );

    expect(find.text(pick), findsOneWidget);
    await tester.tap(find.byKey(const Key('clear-category-filter')));
    await tester.pumpAndSettle();
    expect(category, isNull);
    expect(find.text(pick), findsNothing);
  });

  testWidgets('closes menu without selection via back and Escape', (
    tester,
  ) async {
    const initial = '🍻 Bares e Botecos';
    String? category = initial;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: VenueHomeCategoryFilterDropdown(
            value: category,
            onChanged: (v) => category = v,
          ),
        ),
      ),
    );

    await _openCategoryMenu(tester);
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(category, initial);

    await _openCategoryMenu(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(category, initial);
  });

  testWidgets('scrolls to lower categories in the menu', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: VenueHomeCategoryFilterDropdown(
            value: null,
            onChanged: (_) {},
          ),
        ),
      ),
    );

    await _openCategoryMenu(tester);
    const deepCategory = '🍣 Culinária Asiática';
    await tester.scrollUntilVisible(
      _menuItemInOverlay(deepCategory),
      120,
      scrollable: _overlayMenuScrollable,
    );
    expect(_menuItemInOverlay(deepCategory), findsOneWidget);
    expect(VenueCategories.all.length, greaterThan(10));
  });

  testWidgets('filter sheet stays closable after dismissing category menu', (
    tester,
  ) async {
    String? category = '🍻 Bares e Botecos';
    var headerCloseTaps = 0;

    await tester.pumpWidget(
      _filterSheetHarness(
        category: category,
        onCategoryChanged: (v) => category = v,
        onCloseHeader: () => headerCloseTaps++,
      ),
    );

    await tester.tap(find.byKey(const Key('open-filter-sheet')));
    await tester.pumpAndSettle();
    expect(find.text('Filtrar locais'), findsOneWidget);

    await _openCategoryMenu(tester);
    await tester.tapAt(const Offset(8, 8));
    await tester.pumpAndSettle();
    expect(find.text('Filtrar locais'), findsOneWidget);

    await tester.tap(find.byKey(const Key('venue-filter-sheet-close')));
    await tester.pumpAndSettle();
    expect(find.text('Filtrar locais'), findsNothing);
    expect(headerCloseTaps, 1);
    expect(category, '🍻 Bares e Botecos');
  });

  testWidgets('Aplicar filtros reachable on 320px with bottom inset', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 48);
    tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 48);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);

    String? category;
    var applied = false;

    await tester.pumpWidget(
      _filterSheetHarness(
        category: category,
        onCategoryChanged: (v) => category = v,
        onApply: () => applied = true,
      ),
    );

    await tester.tap(find.byKey(const Key('open-filter-sheet')));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.byKey(const Key('apply-venue-filters')),
      200,
      scrollable: find.byType(Scrollable),
    );
    await tester.tap(find.byKey(const Key('apply-venue-filters')));
    await tester.pumpAndSettle();

    expect(applied, isTrue);
    expect(find.text('Filtrar locais'), findsNothing);
  });
}
