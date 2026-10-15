import 'package:after_app/features/home/home_feed_cards.dart';
import 'package:after_app/features/home/home_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('coluna da home aproveita a largura sem esticar os cards', () {
    expect(HomeVisual.columnMaxWidth(360), 480);
    expect(HomeVisual.columnMaxWidth(800), 540);
    expect(HomeVisual.columnMaxWidth(1440), 600);
  });

  test('legenda de localização segue a origem da cidade', () {
    expect(
      homeLocationCaption(
        displayedCity: 'Campinas',
        displayedUf: 'SP',
        profileCity: 'Campinas',
        profileUf: 'SP',
      ),
      'Sua cidade',
    );
    expect(
      homeLocationCaption(
        displayedCity: 'São Paulo',
        displayedUf: 'SP',
        profileCity: 'Campinas',
        profileUf: 'SP',
      ),
      'Cidade selecionada',
    );
    expect(
      homeLocationCaption(
        displayedCity: 'Sua cidade',
        displayedUf: '',
        profileCity: '',
        profileUf: '',
      ),
      isNull,
    );
  });

  test('selo de oferta só aparece com sinal comercial explícito', () {
    expect(
      homePromotionShowsOfferMark(
        title: 'Chopp em dobro',
        detail: 'Até as 20h',
      ),
      isTrue,
    );
    expect(
      homePromotionShowsOfferMark(title: '20% no chopp', detail: ''),
      isTrue,
    );
    expect(
      homePromotionShowsOfferMark(title: 'Show ao vivo', detail: 'Banda local'),
      isFalse,
    );
    expect(
      homePromotionShowsOfferMark(
        title: 'Promoção do dia',
        detail: 'Evento especial',
      ),
      isFalse,
    );
    expect(homePromotionShowsOfferMark(title: '', detail: ''), isFalse);
  });

  testWidgets('cards isolados aplicam as cores de cada seção', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              HomePromoCard(
                imageUrl: '',
                venueName: 'Refúgio',
                isOpen: false,
                hasOpenInfo: true,
                category: 'Restaurantes',
                dealTitle: 'Chopp em dobro',
                dealDetail: 'Até as 20h',
                validUntil: '14/10/2026',
                distanceLabel: '~9,2 km',
                onTap: () {},
              ),
              HomeVenueCard(
                imageUrl: '',
                venueName: 'Flash',
                isOpen: true,
                hasOpenInfo: true,
                category: 'Baladas e Boates',
                city: 'São José do Rio Preto',
                description: 'Música boa',
                distanceLabel: '~1,5 km',
                onTap: () {},
              ),
            ],
          ),
        ),
      ),
    );

    final promoSurface = tester.widget<Material>(
      find
          .descendant(
            of: find.byType(HomePromoCard),
            matching: find.byType(Material),
          )
          .first,
    );
    final venueSurface = tester.widget<Material>(
      find
          .descendant(
            of: find.byType(HomeVenueCard),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(promoSurface.color, HomeVisual.orangeCard);
    expect(venueSurface.color, HomeVisual.purpleCard);
    expect(
      promoSurface.borderRadius,
      BorderRadius.circular(HomeVisual.cardRadius),
    );
    final image = tester.widget<SizedBox>(
      find
          .descendant(
            of: find.byType(HomePromoCard),
            matching: find.byWidgetPredicate(
              (widget) =>
                  widget is SizedBox && widget.width == HomeVisual.imageWidth,
            ),
          )
          .first,
    );
    expect(image.width, 108);
    final name = tester.widget<Text>(find.text('Refúgio'));
    expect(name.style?.fontSize, 17);
    expect(name.maxLines, 1);
    expect(find.byType(HomeOfferMark), findsOneWidget);
    expect(find.text('Válido para o dia 14/10/2026'), findsOneWidget);
    expect(find.text('São José do Rio Preto'), findsOneWidget);
  });

  testWidgets('chip selecionado fica laranja e o restante branco', (
    tester,
  ) async {
    final today = DateTime(2026, 10, 14);
    final next = DateTime(2026, 10, 15);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeDayStrip(
            days: [today, next],
            selected: today,
            labelFor: (day) => day == today ? 'Hoje' : 'Qui 15/10',
            onSelect: (_) {},
            onCalendar: () {},
          ),
        ),
      ),
    );

    final hoje = tester.widget<HomeDayChip>(
      find.widgetWithText(HomeDayChip, 'Hoje'),
    );
    final outro = tester.widget<HomeDayChip>(
      find.widgetWithText(HomeDayChip, 'Qui 15/10'),
    );
    expect(hoje.selected, isTrue);
    expect(outro.selected, isFalse);

    final hojeMaterial = tester.widget<Material>(
      find
          .descendant(
            of: find.widgetWithText(HomeDayChip, 'Hoje'),
            matching: find.byType(Material),
          )
          .first,
    );
    final outroMaterial = tester.widget<Material>(
      find
          .descendant(
            of: find.widgetWithText(HomeDayChip, 'Qui 15/10'),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(hojeMaterial.color, HomeVisual.orange);
    expect(outroMaterial.color, Colors.white);
    expect(find.byIcon(Icons.calendar_today_outlined), findsOneWidget);
  });

  testWidgets('card estreito não estoura com texto longo', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: HomePromoCard(
              imageUrl: '',
              venueName: 'Refúgio do Chef e da Casa de Shows',
              isOpen: false,
              hasOpenInfo: true,
              category: 'Restaurantes',
              dealTitle: 'Chopp em dobro até o fim da noite',
              dealDetail:
                  'Texto longo o bastante para ocupar duas linhas no card.',
              validUntil: '14/10/2026',
              distanceLabel: '~9,2 km',
              onTap: _noop,
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}

void _noop() {}
