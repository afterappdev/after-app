class PixCharge {
  const PixCharge({
    this.purchaseId,
    this.paymentId,
    this.qrCodeImage,
    this.qrCodeText,
    this.expiresAt,
    this.amount,
    this.currency,
    this.status,
  });

  final String? purchaseId;
  final String? paymentId;
  final String? qrCodeImage;
  final String? qrCodeText;
  final DateTime? expiresAt;
  final double? amount;
  final String? currency;
  final String? status;

  bool get hasQrImage => qrCodeImage != null && qrCodeImage!.trim().isNotEmpty;
  bool get hasCopyPaste => qrCodeText != null && qrCodeText!.trim().isNotEmpty;

  static PixCharge fromResponse(Map<String, dynamic> json) {
    final purchase = _asMap(json['purchase']);
    final pix = _asMap(json['pix']) ?? _asMap(json['charge']);

    return PixCharge(
      purchaseId: _str(json['purchaseId']) ?? _str(purchase?['id']),
      paymentId: _str(json['paymentId']) ??
          _str(pix?['paymentId']) ??
          _str(pix?['id']),
      qrCodeImage: _str(json['qrCodeImage']) ??
          _str(pix?['qrCodeImage']) ??
          _str(pix?['qrCodeUrl']),
      qrCodeText: _str(json['qrCodeText']) ??
          _str(pix?['qrCodeText']) ??
          _str(pix?['copyPaste']) ??
          _str(pix?['emv']),
      expiresAt: _date(json['expiresAt']) ?? _date(pix?['expiresAt']),
      amount: _money(json['amount']) ??
          _money(pix?['amount']) ??
          _money(purchase?['amountPaid']),
      currency: _str(json['currency']) ??
          _str(pix?['currency']) ??
          _str(purchase?['currency']),
      status: _str(json['status']) ?? _str(purchase?['status']),
    );
  }

  PixCharge withStatus(String? next) {
    if (next == null || next.trim().isEmpty) return this;
    return PixCharge(
      purchaseId: purchaseId,
      paymentId: paymentId,
      qrCodeImage: qrCodeImage,
      qrCodeText: qrCodeText,
      expiresAt: expiresAt,
      amount: amount,
      currency: currency,
      status: next,
    );
  }
}

Map<String, dynamic>? _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return null;
}

String? _str(dynamic value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

double? _money(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

DateTime? _date(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  return DateTime.tryParse(value.toString());
}
