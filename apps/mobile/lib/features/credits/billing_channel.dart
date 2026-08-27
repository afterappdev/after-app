import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';

/// Android/iOS → loja nativa. Web (e demais) → PIX.
bool billingUsesStore({bool? isWeb, TargetPlatform? platform}) {
  if (isWeb ?? kIsWeb) return false;
  final p = platform ?? defaultTargetPlatform;
  return p == TargetPlatform.android || p == TargetPlatform.iOS;
}

bool billingUsesPix({bool? isWeb, TargetPlatform? platform}) =>
    !billingUsesStore(isWeb: isWeb, platform: platform);

Map<String, String> pixCreateBody(String packageKey) => {
      'packageKey': packageKey,
    };

int walletBalanceFromResponse(Map<String, dynamic> json) {
  final value = json['balance'];
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

String friendlyPixError(Object error) {
  if (error is ApiException) {
    return friendlyPixErrorFrom(
      statusCode: error.statusCode,
      message: error.message,
    );
  }
  return friendlyPixErrorFrom(message: null);
}

String friendlyPixErrorFrom({int? statusCode, String? message}) {
  final text = (message ?? '').trim();
  final lower = text.toLowerCase();
  if (statusCode == 401) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  if (statusCode == 404) {
    return 'Não encontramos essa compra. Volte e tente novamente.';
  }
  if (statusCode == 503 ||
      lower.contains('not configured') ||
      lower.contains('provider is not configured')) {
    return 'Pagamento por PIX ainda não está disponível.';
  }
  if (text.isEmpty) {
    return 'Não foi possível iniciar o pagamento por PIX.';
  }
  return text;
}
