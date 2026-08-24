import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import 'store_billing_types.dart';

export 'store_billing_types.dart';

class StoreBilling {
  static bool get isSupported =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  static bool get isApple => defaultTargetPlatform == TargetPlatform.iOS;

  static String get providerLabel => isApple ? 'Apple' : 'Google Play';

  static String get providerId => isApple ? 'app_store' : 'google_play';

  Future<void> Function(StorePurchase purchase)? onUnfinishedPurchase;

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;
  Completer<StorePurchase>? _pending;
  bool _listening = false;

  Future<void> ensureListening() async {
    if (_listening) return;
    _listening = true;
    _sub = _iap.purchaseStream.listen(
      _handle,
      onError: (Object error) {
        final pending = _pending;
        if (pending != null && !pending.isCompleted) {
          pending.completeError(StoreBillingException(error.toString()));
        }
      },
    );
  }

  Future<StoreProductInfo?> loadProduct(String productId) async {
    await ensureListening();
    final available = await _iap.isAvailable();
    if (!available) {
      throw StoreBillingException(
        isApple
            ? 'Compras da Apple indisponíveis neste dispositivo.'
            : 'Google Play Billing indisponível neste dispositivo.',
      );
    }
    final response = await _iap.queryProductDetails({productId});
    if (response.productDetails.isEmpty) return null;
    final product = response.productDetails.first;
    return StoreProductInfo(id: product.id, price: product.price);
  }

  Future<StorePurchase> purchase(String productId) async {
    await ensureListening();
    final available = await _iap.isAvailable();
    if (!available) {
      throw StoreBillingException(
        isApple
            ? 'Compras da Apple indisponíveis neste dispositivo.'
            : 'Google Play Billing indisponível neste dispositivo.',
      );
    }
    final response = await _iap.queryProductDetails({productId});
    if (response.productDetails.isEmpty) {
      throw StoreBillingException(
        'Produto $productId não encontrado na loja. Cadastre-o no Google Play Console ou no App Store Connect.',
      );
    }
    if (_pending != null && !_pending!.isCompleted) {
      throw StoreBillingException('Já existe uma compra em andamento.');
    }
    _pending = Completer<StorePurchase>();
    final started = await _iap.buyConsumable(
      purchaseParam: PurchaseParam(
        productDetails: response.productDetails.first,
      ),
    );
    if (!started) {
      _pending = null;
      throw StoreBillingException('Não foi possível iniciar a compra na loja.');
    }
    try {
      return await _pending!.future.timeout(
        const Duration(minutes: 4),
        onTimeout: () {
          throw StoreBillingException('Tempo esgotado aguardando a loja.');
        },
      );
    } finally {
      _pending = null;
    }
  }

  Future<void> complete(StorePurchase purchase) async {
    final details = purchase.native;
    if (details is PurchaseDetails && details.pendingCompletePurchase) {
      await _iap.completePurchase(details);
    }
  }

  Future<void> _handle(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.status == PurchaseStatus.pending) continue;

      if (purchase.status == PurchaseStatus.error) {
        final pending = _pending;
        if (pending != null && !pending.isCompleted) {
          pending.completeError(
            StoreBillingException(
              purchase.error?.message ?? 'Falha no pagamento da loja.',
            ),
          );
        }
        if (purchase.pendingCompletePurchase) {
          await _iap.completePurchase(purchase);
        }
        continue;
      }

      if (purchase.status == PurchaseStatus.canceled) {
        final pending = _pending;
        if (pending != null && !pending.isCompleted) {
          pending.completeError(StoreBillingException('Pagamento cancelado.'));
        }
        continue;
      }

      if (purchase.status == PurchaseStatus.purchased ||
          purchase.status == PurchaseStatus.restored) {
        final result = StorePurchase(
          productId: purchase.productID,
          purchaseId: purchase.purchaseID ?? '',
          verificationData: purchase.verificationData.serverVerificationData,
          provider: StoreBilling.providerId,
          native: purchase,
        );
        final pending = _pending;
        if (pending != null && !pending.isCompleted) {
          pending.complete(result);
        } else {
          final callback = onUnfinishedPurchase;
          if (callback != null) {
            try {
              await callback(result);
            } catch (_) {}
          }
        }
      }
    }
  }

  void dispose() {
    _sub?.cancel();
    _sub = null;
    _listening = false;
  }
}
