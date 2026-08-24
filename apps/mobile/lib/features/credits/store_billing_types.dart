class StoreBillingException implements Exception {
  StoreBillingException(this.message);
  final String message;

  @override
  String toString() => message;
}

class StoreProductInfo {
  const StoreProductInfo({required this.id, required this.price});

  final String id;
  final String price;
}

class StorePurchase {
  const StorePurchase({
    required this.productId,
    required this.purchaseId,
    required this.verificationData,
    required this.provider,
    this.native,
  });

  final String productId;
  final String purchaseId;
  final String verificationData;
  final String provider;
  final Object? native;
}

String storeProductIdFor(String packageKey) {
  switch (packageKey) {
    case 'unit_1':
      return 'after.credits.1';
    case 'combo_5':
      return 'after.credits.5';
    case 'combo_10':
      return 'after.credits.10';
    default:
      return packageKey;
  }
}
