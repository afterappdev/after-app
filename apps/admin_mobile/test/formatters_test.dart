import 'package:after_admin/core/formatters/admin_formatters.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

void main() {
  setUpAll(() async {
    Intl.defaultLocale = 'pt_BR';
    await initializeDateFormatting('pt_BR');
  });

  test('formata BRL com duas casas', () {
    String normalize(String value) =>
        value.replaceAll('\u00a0', ' ').replaceAll('\u202f', ' ');
    expect(normalize(formatBrl(340)), 'R\$ 340,00');
    expect(normalize(formatBrl(0)), 'R\$ 0,00');
    expect(normalize(formatBrl(7825)), 'R\$ 7.825,00');
  });

  test('traduz providers para o painel', () {
    expect(providerLabel('google_play'), 'Google Play');
    expect(providerLabel('app_store'), 'Apple');
    expect(providerLabel('pix'), 'PIX');
  });

  test('traduz roles', () {
    expect(roleLabel('USER'), 'Usuário');
    expect(roleLabel('VENUE'), 'Estabelecimento');
  });

  test('abreviacao de mês em português', () {
    expect(monthAbbrevFromYearMonth('2026-09'), 'Set');
    expect(monthAbbrevFromYearMonth('2025-10'), 'Out');
  });
}
