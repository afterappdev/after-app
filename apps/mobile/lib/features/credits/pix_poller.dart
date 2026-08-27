import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import 'purchase_labels.dart';

typedef PixStatusFetcher = Future<String> Function(String purchaseId);

class PixPurchasePoller {
  PixPurchasePoller({
    required this.fetchStatus,
    this.interval = const Duration(seconds: 4),
    this.timeout = const Duration(minutes: 10),
  });

  final PixStatusFetcher fetchStatus;
  final Duration interval;
  final Duration timeout;

  Timer? _timer;
  bool _active = false;
  DateTime? _startedAt;

  bool get isActive => _active;

  void start({
    required String purchaseId,
    required void Function(String status) onStatus,
    void Function()? onTimeout,
    void Function(Object error)? onFatalError,
  }) {
    stop();
    _active = true;
    _startedAt = DateTime.now();

    Future<void> tick() async {
      if (!_active) return;
      final started = _startedAt;
      if (started != null && DateTime.now().difference(started) >= timeout) {
        stop();
        onTimeout?.call();
        return;
      }
      try {
        final status = await fetchStatus(purchaseId);
        if (!_active) return;
        onStatus(status);
        if (isTerminalPurchaseStatus(status)) {
          stop();
        }
      } catch (error) {
        if (!_active) return;
        logSanitizedPixPollError(error);
        if (isTransientPixPollError(error)) return;
        stop();
        onFatalError?.call(error);
      }
    }

    unawaited(tick());
    _timer = Timer.periodic(interval, (_) => unawaited(tick()));
  }

  void stop() {
    _active = false;
    _timer?.cancel();
    _timer = null;
  }

  void dispose() => stop();
}

bool isTransientPixPollError(Object error) {
  if (error is ApiException) {
    final code = error.statusCode;
    if (code == null) return true;
    if (code >= 500 && code <= 599) return true;
    if (code == 408 || code == 429) return true;
    return false;
  }
  return true;
}

void logSanitizedPixPollError(Object error) {
  if (!kDebugMode) return;
  debugPrint('PIX poll: ${sanitizeClientError(error)}');
}

String sanitizeClientError(Object error) {
  var text = error is ApiException
      ? 'HTTP ${error.statusCode ?? '?'} ${error.message}'
      : error.toString();
  return text
      .replaceAll(RegExp(r'Bearer\s+\S+', caseSensitive: false), 'Bearer [redacted]')
      .replaceAll(RegExp(r'APP_USR-[A-Za-z0-9._-]+'), '[redacted]')
      .replaceAll(RegExp(r'TEST-[A-Za-z0-9._-]+'), '[redacted]')
      .replaceAll(
        RegExp(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),
        '[redacted-jwt]',
      );
}
