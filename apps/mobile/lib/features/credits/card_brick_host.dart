class CardBrickForm {
  const CardBrickForm({
    required this.token,
    required this.paymentMethodId,
    this.paymentType = 'credit_card',
    this.installments = 1,
  });

  final String token;
  final String paymentMethodId;
  final String paymentType;
  final int installments;
}

class CardBrickUserException implements Exception {
  CardBrickUserException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CardBrickMountRequest {
  const CardBrickMountRequest({
    required this.viewType,
    required this.publicKey,
    required this.amount,
    required this.onSubmit,
    required this.onBrickError,
    this.viewId,
    this.payerEmail,
  });

  final String viewType;
  final int? viewId;
  final String publicKey;
  final double amount;
  final String? payerEmail;
  final Future<void> Function(CardBrickForm form) onSubmit;
  final void Function(String message) onBrickError;
}

abstract class CardBrickHost {
  bool get usesPlatformView;

  void registerView(String viewType) {}

  Future<void> mount(CardBrickMountRequest request);

  Future<void> unmount();
}
