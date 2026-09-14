import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:after_app/core/validation/br_document_validator.dart';
import 'package:after_app/features/credits/billing_channel.dart';
import 'package:after_app/features/credits/fiscal_invoice_controller.dart';
import 'package:after_app/features/credits/fiscal_invoice_section.dart';

void main() {
  test('CPF válido e inválido', () {
    expect(BrDocumentValidator.isValidCpf('12345678909'), isTrue);
    expect(BrDocumentValidator.isValidCpf('123.456.789-09'), isTrue);
    expect(BrDocumentValidator.isValidCpf('11111111111'), isFalse);
    expect(BrDocumentValidator.isValidCpf('12345678900'), isFalse);
  });

  test('CNPJ válido e inválido', () {
    expect(BrDocumentValidator.isValidCnpj('11444777000161'), isTrue);
    expect(BrDocumentValidator.isValidCnpj('11.444.777/0001-61'), isTrue);
    expect(BrDocumentValidator.isValidCnpj('00000000000000'), isFalse);
    expect(BrDocumentValidator.isValidCnpj('11444777000162'), isFalse);
  });

  test('máscara visual de CPF e CNPJ', () {
    expect(BrDocumentValidator.formatCpf('12345678909'), '123.456.789-09');
    expect(BrDocumentValidator.formatCnpj('11444777000161'), '11.444.777/0001-61');
  });

  test('padrão é não informar dados fiscais', () {
    final controller = FiscalInvoiceController();
    expect(controller.invoiceRequested, isFalse);
    expect(controller.toApiPayload(), {'invoiceRequested': false});
    expect(controller.validate(), isNull);
  });

  test('quando Não, payload não envia documento', () {
    final controller = FiscalInvoiceController()
      ..invoiceRequested = false
      ..name = 'João'
      ..documentMasked = '123.456.789-09'
      ..email = 'a@b.com';
    expect(controller.toApiPayload(), {'invoiceRequested': false});
    expect(controller.toApiPayload().containsKey('fiscalDocument'), isFalse);
  });

  test('payload de CPF contém somente números', () {
    final controller = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CPF'
      ..name = 'João da Silva'
      ..documentMasked = '123.456.789-09'
      ..email = 'Email@Exemplo.COM';
    expect(controller.validate(), isNull);
    expect(controller.toApiPayload(), {
      'invoiceRequested': true,
      'fiscalPersonType': 'CPF',
      'fiscalName': 'João da Silva',
      'fiscalDocument': '12345678909',
      'fiscalEmail': 'email@exemplo.com',
    });
  });

  test('e-mail inválido e nome obrigatório bloqueiam', () {
    final missingName = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CPF'
      ..documentMasked = '12345678909'
      ..email = 'ok@ok.com';
    expect(missingName.validate(), 'Informe o nome ou razão social.');

    final badEmail = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CPF'
      ..name = 'João'
      ..documentMasked = '12345678909'
      ..email = 'invalido';
    expect(badEmail.validate(), 'E-mail fiscal inválido.');

    final badCpf = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CPF'
      ..name = 'João'
      ..documentMasked = '12345678900'
      ..email = 'a@b.com';
    expect(badCpf.validate(), 'CPF inválido.');

    final badCnpj = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CNPJ'
      ..name = 'Empresa LTDA'
      ..documentMasked = '11444777000162'
      ..email = 'a@b.com';
    expect(badCnpj.validate(), 'CNPJ inválido.');
  });

  test('e-mail da conta preenche uma vez e não sobrescreve depois', () {
    final controller = FiscalInvoiceController();
    controller.applyAccountEmail('conta@after.com');
    expect(controller.email, 'conta@after.com');
    controller.markEmailTouched();
    controller.email = 'outro@after.com';
    controller.applyAccountEmail('conta@after.com');
    expect(controller.email, 'outro@after.com');
  });

  test('dados fiscais chegam ao fluxo PIX e store', () {
    final fiscal = FiscalInvoiceController()
      ..invoiceRequested = true
      ..personType = 'CPF'
      ..name = 'João da Silva'
      ..documentMasked = '123.456.789-09'
      ..email = 'a@b.com';
    final pix = pixCreateBody('combo_10', fiscal.toApiPayload());
    expect(pix['packageKey'], 'combo_10');
    expect(pix['fiscalDocument'], '12345678909');
    expect(pix['invoiceRequested'], isTrue);

    final store = storeConfirmBody(
      packageKey: 'unit_1',
      productId: 'after.credits.1',
      provider: 'google_play',
      purchaseId: 'gp-1',
      verificationData: 'token',
      fiscal: fiscal.toApiPayload(),
    );
    expect(store['provider'], 'google_play');
    expect(store['purchaseId'], 'gp-1');
    expect(store['verificationData'], 'token');
    expect(store['fiscalDocument'], '12345678909');
    expect(store.containsKey('productId'), isTrue);
  });

  testWidgets('campos fiscais aparecem só ao selecionar Sim', (tester) async {
    final controller = FiscalInvoiceController();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => FiscalInvoiceSection(
              controller: controller,
              onChanged: () => setState(() {}),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Dados fiscais'), findsOneWidget);
    expect(find.text('Deseja informar dados para emissão fiscal?'), findsOneWidget);
    expect(find.byKey(const Key('fiscal-name')), findsNothing);

    await tester.tap(find.byKey(const Key('fiscal-request-yes')));
    await tester.pump();
    expect(find.byKey(const Key('fiscal-name')), findsOneWidget);
    expect(find.byKey(const Key('fiscal-document')), findsOneWidget);
    expect(find.byKey(const Key('fiscal-email')), findsOneWidget);
    expect(find.text('Esses dados ficarão vinculados a esta compra.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('fiscal-type-cnpj')));
    await tester.pump();
    expect(controller.personType, 'CNPJ');
    expect(find.text('Razão social'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('fiscal-document')), '11444777000161');
    await tester.pump();
    expect(controller.documentMasked, '11.444.777/0001-61');
    expect(controller.documentDigits, '11444777000161');

    await tester.tap(find.byKey(const Key('fiscal-request-no')));
    await tester.pump();
    expect(find.byKey(const Key('fiscal-name')), findsNothing);
  });
}
