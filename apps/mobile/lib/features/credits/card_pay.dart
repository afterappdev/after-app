import 'dart:math';

import '../../core/network/api_client.dart';

const cardApprovedMessage =
    'Pagamento aprovado. Seus créditos já estão na carteira.';
const cardRejectedMessage =
    'Pagamento recusado. Nenhum crédito foi adicionado. Você pode tentar outro cartão.';
const cardPendingMessage =
    'Pagamento em análise. Se o banco pedir uma confirmação adicional, conclua essa etapa. Os créditos só entram depois da confirmação do servidor.';
const cardPollTimeoutMessage =
    'Ainda não identificamos a confirmação. Não faremos outra cobrança. Você pode voltar e consultar o histórico.';
const cardUnknownWithoutIdMessage =
    'Não foi possível confirmar o resultado deste pagamento. Consulte o histórico antes de tentar de novo. Nenhuma nova cobrança será feita automaticamente.';
const cardCancelledMessage =
    'Pagamento cancelado. Nenhum crédito foi adicionado.';
const cardRefundedMessage =
    'Este pagamento foi estornado. Nenhum crédito será adicionado.';
const cardDuplicateSubmitMessage = 'Este pagamento já está em andamento.';
const cardConfigUnavailableMessage =
    'Pagamento por cartão ainda não está disponível. Você ainda pode pagar com PIX.';
const cardCommunicationMessage =
    'A comunicação com o pagamento falhou. Não enviaremos outra cobrança automaticamente.';

enum CardAttemptPhase {
  ready,
  submitting,
  approved,
  rejected,
  pending,
  cancelled,
  refunded,
  unknown,
}

class CardAttempt {
  const CardAttempt({
    required this.idempotencyKey,
    this.phase = CardAttemptPhase.ready,
    this.purchaseId,
    this.message,
    this.pollTimedOut = false,
  });

  final String idempotencyKey;
  final CardAttemptPhase phase;
  final String? purchaseId;
  final String? message;
  final bool pollTimedOut;

  bool get acceptsSubmit =>
      phase == CardAttemptPhase.ready ||
      phase == CardAttemptPhase.rejected ||
      phase == CardAttemptPhase.cancelled;

  bool get allowsMethodSwitch =>
      phase == CardAttemptPhase.ready ||
      phase == CardAttemptPhase.rejected ||
      phase == CardAttemptPhase.cancelled;

  bool get showsBrick =>
      phase == CardAttemptPhase.ready ||
      phase == CardAttemptPhase.submitting ||
      phase == CardAttemptPhase.rejected ||
      phase == CardAttemptPhase.cancelled;

  CardAttempt copyWith({
    String? idempotencyKey,
    CardAttemptPhase? phase,
    String? purchaseId,
    String? message,
    bool? pollTimedOut,
    bool clearPurchaseId = false,
  }) {
    return CardAttempt(
      idempotencyKey: idempotencyKey ?? this.idempotencyKey,
      phase: phase ?? this.phase,
      purchaseId: clearPurchaseId ? null : (purchaseId ?? this.purchaseId),
      message: message ?? this.message,
      pollTimedOut: pollTimedOut ?? this.pollTimedOut,
    );
  }
}

class CardAttemptStep {
  const CardAttemptStep({
    required this.attempt,
    this.poll = false,
    this.reloadWallet = false,
    this.rejectBrick = false,
  });

  final CardAttempt attempt;
  final bool poll;
  final bool reloadWallet;
  final bool rejectBrick;
}

class CardPayResult {
  const CardPayResult({
    required this.purchaseId,
    required this.status,
    required this.outcome,
    this.orderId,
  });

  final String? purchaseId;
  final String status;
  final String outcome;
  final String? orderId;

  factory CardPayResult.parse(Object? raw) {
    if (raw is! Map) {
      return const CardPayResult(purchaseId: null, status: '', outcome: 'unknown');
    }
    final json = Map<String, dynamic>.from(raw);
    return CardPayResult(
      purchaseId: usablePurchaseId(json['purchaseId']?.toString()),
      status: json['status']?.toString() ?? '',
      outcome: json['outcome']?.toString().trim().toLowerCase() ?? 'unknown',
      orderId: usableOrderId(json['orderId']?.toString()),
    );
  }
}

String? usablePurchaseId(String? value) {
  final text = value?.trim() ?? '';
  if (text.isEmpty) return null;
  return text;
}

String? usableOrderId(String? value) {
  final text = value?.trim() ?? '';
  if (text.isEmpty || RegExp(r'^\d+$').hasMatch(text)) return null;
  return text;
}

CardAttemptStep _pendingWithOrder(CardAttempt current, String purchaseId) {
  return CardAttemptStep(
    attempt: current.copyWith(
      phase: CardAttemptPhase.pending,
      purchaseId: purchaseId,
      message: cardPendingMessage,
    ),
    poll: true,
  );
}

String createCardIdempotencyKey([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}

Map<String, dynamic> cardPayBody({
  required String packageKey,
  required String idempotencyKey,
  required String token,
  required String paymentMethodId,
  Map<String, dynamic>? fiscal,
}) {
  return {
    'packageKey': packageKey,
    'idempotencyKey': idempotencyKey,
    'token': token,
    'paymentMethodId': paymentMethodId,
    'paymentType': 'credit_card',
    'installments': 1,
    ...?fiscal,
  };
}

CardAttempt beginCardSubmit(
  CardAttempt current, {
  required String Function() nextKey,
}) {
  if (!current.acceptsSubmit) {
    throw StateError('card submit blocked');
  }
  final key = current.phase == CardAttemptPhase.rejected ||
          current.phase == CardAttemptPhase.cancelled
      ? nextKey()
      : current.idempotencyKey;
  return CardAttempt(
    idempotencyKey: key,
    phase: CardAttemptPhase.submitting,
  );
}

CardAttemptStep applyCardPayResult(CardAttempt current, CardPayResult result) {
  final id = result.purchaseId;
  final outcome = result.outcome.trim().toLowerCase();
  final status = result.status.trim().toUpperCase();

  switch (outcome) {
    case 'approved':
      if (status == 'PAID' && id != null) {
        return CardAttemptStep(
          attempt: current.copyWith(
            phase: CardAttemptPhase.approved,
            purchaseId: id,
            message: cardApprovedMessage,
          ),
          reloadWallet: true,
        );
      }
      if (id != null && result.orderId != null) return _pendingWithOrder(current, id);
      return _unknown(current);
    case 'rejected':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.rejected,
          purchaseId: id,
          message: cardRejectedMessage,
        ),
        rejectBrick: true,
      );
    case 'cancelled':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.cancelled,
          purchaseId: id,
          message: cardCancelledMessage,
        ),
        rejectBrick: true,
      );
    case 'refunded':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.refunded,
          purchaseId: id,
          message: cardRefundedMessage,
        ),
      );
    case 'pending':
      if (id != null && result.orderId != null) return _pendingWithOrder(current, id);
      return _unknown(current);
    case 'unknown':
    default:
      if (id != null && result.orderId != null) return _pendingWithOrder(current, id);
      return _unknown(current);
  }
}

CardAttemptStep applyCardPollStatus(CardAttempt current, String? rawStatus) {
  switch ((rawStatus ?? '').trim().toUpperCase()) {
    case 'PAID':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.approved,
          message: cardApprovedMessage,
          pollTimedOut: false,
        ),
        reloadWallet: true,
      );
    case 'FAILED':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.rejected,
          message: cardRejectedMessage,
          pollTimedOut: false,
        ),
      );
    case 'CANCELLED':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.cancelled,
          message: cardCancelledMessage,
          pollTimedOut: false,
        ),
      );
    case 'REFUNDED':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.refunded,
          message: cardRefundedMessage,
          pollTimedOut: false,
        ),
        reloadWallet: true,
      );
    case 'PENDING':
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.pending,
          message: cardPendingMessage,
        ),
        poll: true,
      );
    default:
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.pending,
          message: cardPendingMessage,
        ),
        poll: true,
      );
  }
}

CardAttempt markCardPollTimeout(CardAttempt current) {
  return current.copyWith(
    phase: CardAttemptPhase.pending,
    pollTimedOut: true,
    message: cardPollTimeoutMessage,
  );
}

CardAttemptStep applyCardHttpFailure(CardAttempt current, Object error) {
  if (error is ApiException) {
    final code = error.statusCode;
    if (code == 400 || code == 422) {
      return CardAttemptStep(
        attempt: current.copyWith(
          phase: CardAttemptPhase.rejected,
          message: friendlyCardError(error),
        ),
        rejectBrick: true,
      );
    }
  }
  return _unknown(current, message: friendlyCardError(error));
}

CardAttemptStep _unknown(CardAttempt current, {String? message}) {
  return CardAttemptStep(
    attempt: current.copyWith(
      phase: CardAttemptPhase.unknown,
      message: message ?? cardUnknownWithoutIdMessage,
      clearPurchaseId: current.purchaseId == null,
    ),
  );
}

String friendlyCardConfigError(Object error) {
  if (error is ApiException && error.statusCode == 401) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  return cardConfigUnavailableMessage;
}

String friendlyCardError(Object error) {
  if (error is ApiException) {
    final code = error.statusCode;
    if (code == 401) return 'Sua sessão expirou. Entre novamente.';
    if (code == null || code == 408 || code == 429 || code >= 500) {
      return cardCommunicationMessage;
    }
    final cleaned = redactCardSecrets(error.message);
    if (cleaned.isEmpty) return 'Não foi possível concluir o pagamento.';
    return cleaned;
  }
  return cardCommunicationMessage;
}

String redactCardSecrets(String text) {
  final cleaned = text
      .replaceAll(RegExp(r'\b[A-Za-z0-9_-]{20,}\b'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return cleaned;
}
