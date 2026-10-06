import 'package:after_app/features/venue/promo_validity.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final noonInSaoPaulo = DateTime.utc(2026, 10, 6, 15);

  test('promoção com data de ontem é vencida', () {
    expect(
      isPromotionExpired(['2026-10-05'], utcNow: noonInSaoPaulo),
      isTrue,
    );
  });

  test('promoção com data de hoje continua válida', () {
    expect(
      isPromotionExpired(
        ['2026-10-06T00:00:00.000Z'],
        utcNow: noonInSaoPaulo,
      ),
      isFalse,
    );
  });

  test('promoção com data de amanhã continua válida', () {
    expect(
      isPromotionExpired(['2026-10-07'], utcNow: noonInSaoPaulo),
      isFalse,
    );
  });

  test('várias datas, todas passadas, vencem depois da última', () {
    expect(
      isPromotionExpired(
        ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'],
        utcNow: noonInSaoPaulo,
      ),
      isTrue,
    );
  });

  test('uma data futura entre as datas impede o vencimento', () {
    expect(
      isPromotionExpired(
        ['2026-09-23', '2026-09-24', '2026-10-20'],
        utcNow: noonInSaoPaulo,
      ),
      isFalse,
    );
  });

  test('CANCELLED continua cancelada e não vira vencida', () {
    expect(
      showPromotionExpired(
        status: 'CANCELLED',
        displayDates: ['2026-09-22T00:00:00.000Z'],
        utcNow: noonInSaoPaulo,
      ),
      isFalse,
    );
    expect(
      showPromotionExpired(
        status: 'ACTIVE',
        displayDates: ['2026-09-22'],
        utcNow: noonInSaoPaulo,
      ),
      isTrue,
    );
  });

  test('o dia de validade inteiro vale em America/Sao_Paulo', () {
    final stillTheSixth = DateTime.utc(2026, 10, 7, 2, 30);
    final alreadyTheSeventh = DateTime.utc(2026, 10, 7, 3);

    expect(
      saoPauloCalendarDay(stillTheSixth),
      DateTime.utc(2026, 10, 6),
    );
    expect(
      isPromotionExpired(['2026-10-06'], utcNow: stillTheSixth),
      isFalse,
    );
    expect(
      saoPauloCalendarDay(alreadyTheSeventh),
      DateTime.utc(2026, 10, 7),
    );
    expect(
      isPromotionExpired(['2026-10-06'], utcNow: alreadyTheSeventh),
      isTrue,
    );
  });

  test('data UTC meia-noite não muda para o dia anterior', () {
    expect(formatStoredCalendarDate('2026-10-06T00:00:00.000Z'), '06/10/2026');
    final card = promotionCardDate(
      status: 'ACTIVE',
      displayDates: ['2026-10-06T00:00:00.000Z'],
      utcNow: DateTime.utc(2026, 10, 7, 2, 30),
    );
    expect(card.expired, isFalse);
    expect(card.dayLabel, '06/10/2026');
  });

  test('passada mais futura mostra a próxima data futura', () {
    final card = promotionCardDate(
      status: 'ACTIVE',
      displayDates: [
        '2026-09-23T00:00:00.000Z',
        '2026-09-24T00:00:00.000Z',
        '2026-10-10T00:00:00.000Z',
      ],
      utcNow: noonInSaoPaulo,
    );
    expect(card.expired, isFalse);
    expect(card.dayLabel, '10/10/2026');
  });

  test('hoje mais futura mostra a data de hoje', () {
    final card = promotionCardDate(
      status: 'ACTIVE',
      displayDates: [
        '2026-10-06T00:00:00.000Z',
        '2026-10-20T00:00:00.000Z',
      ],
      utcNow: noonInSaoPaulo,
    );
    expect(card.expired, isFalse);
    expect(card.dayLabel, '06/10/2026');
  });

  test('várias datas futuras mostram a mais próxima', () {
    final card = promotionCardDate(
      status: 'ACTIVE',
      displayDates: ['2026-10-20', '2026-10-08', '2026-11-01'],
      utcNow: noonInSaoPaulo,
    );
    expect(card.dayLabel, '08/10/2026');
  });

  test('todas as datas passadas mostram promoção vencida', () {
    final card = promotionCardDate(
      status: 'ACTIVE',
      displayDates: ['2026-09-23', '2026-09-24', '2026-09-26'],
      utcNow: noonInSaoPaulo,
    );
    expect(card.expired, isTrue);
    expect(card.dayLabel, isEmpty);
  });
}
