import 'package:flutter/services.dart';

import '../../core/validation/br_document_validator.dart';

class BrDocumentInputFormatter extends TextInputFormatter {
  BrDocumentInputFormatter({required this.cnpj});

  final bool cnpj;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final max = cnpj ? 14 : 11;
    var digits = BrDocumentValidator.digitsOnly(newValue.text);
    if (digits.length > max) digits = digits.substring(0, max);
    final text = cnpj
        ? BrDocumentValidator.formatCnpj(digits)
        : BrDocumentValidator.formatCpf(digits);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class FiscalInvoiceController {
  FiscalInvoiceController({String? initialEmail}) {
    if (initialEmail != null && initialEmail.trim().isNotEmpty) {
      email = initialEmail.trim();
    }
  }

  bool invoiceRequested = false;
  String personType = 'CPF';
  String name = '';
  String documentMasked = '';
  String email = '';
  bool _emailTouched = false;

  void applyAccountEmail(String? accountEmail) {
    if (_emailTouched) return;
    if (email.trim().isNotEmpty) return;
    final value = accountEmail?.trim() ?? '';
    if (value.isEmpty) return;
    email = value;
  }

  void markEmailTouched() => _emailTouched = true;

  String get documentDigits =>
      BrDocumentValidator.digitsOnly(documentMasked);

  Map<String, dynamic> toApiPayload() {
    if (!invoiceRequested) {
      return {'invoiceRequested': false};
    }
    return {
      'invoiceRequested': true,
      'fiscalPersonType': personType,
      'fiscalName': name.trim(),
      'fiscalDocument': documentDigits,
      'fiscalEmail': email.trim().toLowerCase(),
    };
  }

  String? validate() {
    if (!invoiceRequested) return null;
    if (name.trim().length < 2) {
      return 'Informe o nome ou razão social.';
    }
    if (personType == 'CNPJ') {
      if (!BrDocumentValidator.isValidCnpj(documentMasked)) {
        return 'CNPJ inválido.';
      }
    } else if (!BrDocumentValidator.isValidCpf(documentMasked)) {
      return 'CPF inválido.';
    }
    if (!BrDocumentValidator.isValidEmail(email)) {
      return 'E-mail fiscal inválido.';
    }
    return null;
  }
}
