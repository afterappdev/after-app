import 'store_billing_types.dart';

export 'store_billing_types.dart';

class StoreBilling {
  static bool get isSupported => false;
  static bool get isApple => false;
  static String get providerLabel => 'Loja';
  static String get providerId => 'none';

  Future<void> Function(StorePurchase purchase)? onUnfinishedPurchase;

  Future<StoreProductInfo?> loadProduct(String productId) async => null;

  Future<StorePurchase> purchase(String productId) async {
    throw StoreBillingException(
      'Compras na loja não estão disponíveis nesta plataforma.',
    );
  }

  Future<void> complete(StorePurchase purchase) async {}

  void dispose() {}
}
