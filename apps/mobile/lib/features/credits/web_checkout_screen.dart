import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import 'billing_channel.dart';
import 'card_brick.dart';
import 'card_brick_view.dart';
import 'card_pay.dart';
import 'credits_ui.dart';
import 'fiscal_invoice_controller.dart';
import 'venue_fiscal_document.dart';
import 'fiscal_invoice_section.dart';
import 'pix_checkout.dart';
import 'pix_poller.dart';

class WebCheckoutScreen extends StatefulWidget {
  const WebCheckoutScreen({
    super.key,
    required this.pack,
    this.brickHost,
    this.usePlatformView,
    this.pollerFactory,
    this.nextIdempotencyKey,
  });

  final Map<String, dynamic> pack;
  final CardBrickHost? brickHost;
  final bool? usePlatformView;
  final PixPurchasePoller Function(PixStatusFetcher fetchStatus)? pollerFactory;
  final String Function()? nextIdempotencyKey;

  @override
  State<WebCheckoutScreen> createState() => _WebCheckoutScreenState();
}

class _WebCheckoutScreenState extends State<WebCheckoutScreen> {
  late final CardBrickHost _host;
  late final String _viewType;
  late final FiscalInvoiceController _fiscal;
  late Map<String, dynamic> _pack;
  late CardAttempt _attempt;
  PixPurchasePoller? _poller;
  _PayMethod _method = _PayMethod.pix;
  String? _publicKey;
  String? _payerEmail;
  String? _configError;
  String? _brickError;
  bool _configLoading = false;
  bool _catalogReady = false;
  bool _vipPaymentBlocked = false;
  bool _submitLock = false;
  bool _refreshingWallet = false;
  int? _walletBalance;

  bool get _usePlatformView => widget.usePlatformView ?? _host.usesPlatformView;

  int get _credits => asInt(_pack['credits']);
  double get _catalogPrice => asMoney(_pack['priceBrl']);
  String get _packageKey => _pack['key']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    _host = widget.brickHost ?? createCardBrickHost();
    _viewType = 'after-card-brick-${identityHashCode(this)}';
    _fiscal = FiscalInvoiceController();
    _pack = Map<String, dynamic>.from(widget.pack);
    _vipPaymentBlocked = isVipCreditRecord(_pack);
    _attempt = CardAttempt(idempotencyKey: _newKey());
    _refreshCatalog();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    try {
      final auth = context.read<AuthController>();
      final email = auth.user?.email;
      _fiscal.applyAccountEmail(email);
      _payerEmail = email;
      loadVenueFiscalDocument(
        api: context.read<ApiClient>(),
        auth: auth,
        fiscal: _fiscal,
        onLoaded: () {
          if (mounted) setState(() {});
        },
      );
    } catch (_) {}
  }

  @override
  void dispose() {
    _poller?.dispose();
    super.dispose();
  }

  String _newKey() =>
      (widget.nextIdempotencyKey ?? createCardIdempotencyKey)();

  Future<void> _refreshCatalog() async {
    if (isVipCreditRecord(widget.pack)) {
      await _refreshVipCatalog();
      return;
    }
    try {
      final api = context.read<ApiClient>();
      final raw = await api.get('/credits/packages');
      if (!mounted) return;
      if (raw is List) {
        for (final item in raw) {
          if (item is! Map) continue;
          final map = Map<String, dynamic>.from(item);
          if (map['key']?.toString() == widget.pack['key']?.toString()) {
            setState(() {
              _pack = map;
              _catalogReady = true;
            });
            return;
          }
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _catalogReady = true);
  }

  Future<void> _refreshVipCatalog() async {
    try {
      final api = context.read<ApiClient>();
      final raw = await api.get('/credits/vip-packages');
      final offer = firstDisplayableVipOffer(raw);
      final payable = offer == null ? null : vipWebCheckoutPack(offer);
      if (!mounted) return;
      setState(() {
        if (payable != null) _pack = payable;
        _vipPaymentBlocked = payable == null;
        _catalogReady = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _vipPaymentBlocked = true;
        _catalogReady = true;
      });
    }
  }

  Future<void> _selectPix() async {
    if (!_attempt.allowsMethodSwitch) return;
    setState(() => _method = _PayMethod.pix);
  }

  Future<void> _selectCard() async {
    if (!_attempt.allowsMethodSwitch) return;
    setState(() => _method = _PayMethod.card);
    if (_publicKey != null || _configLoading) return;
    setState(() {
      _configLoading = true;
      _configError = null;
    });
    try {
      final api = context.read<ApiClient>();
      final raw = await api.get('/credits/card/config');
      final map = raw is Map<String, dynamic>
          ? raw
          : Map<String, dynamic>.from(raw as Map);
      final key = map['publicKey']?.toString().trim() ?? '';
      if (key.isEmpty) {
        throw ApiException(cardConfigUnavailableMessage, statusCode: 503);
      }
      if (!mounted) return;
      setState(() {
        _publicKey = key;
        _configLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _configLoading = false;
        _configError = friendlyCardConfigError(error);
      });
    }
  }

  Future<void> _openPix() async {
    if (_vipPaymentBlocked || !_attempt.allowsMethodSwitch) return;
    if (isVipCreditRecord(_pack) && vipWebCheckoutPack(_pack) == null) return;
    final paid = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PixCheckoutScreen(pack: _pack)),
    );
    if (!mounted) return;
    if (paid == true) Navigator.of(context).pop(true);
  }

  Future<void> _onBrickSubmit(CardBrickForm form) async {
    if (form.installments != 1 || form.paymentType != 'credit_card') {
      const message = 'Somente cartão de crédito à vista está disponível.';
      _surfaceUserError(message);
      throw CardBrickUserException(message);
    }
    final fiscalError = _fiscal.validate();
    if (fiscalError != null) {
      _surfaceUserError(fiscalError);
      throw CardBrickUserException(fiscalError);
    }
    if (_vipPaymentBlocked || (isVipCreditRecord(_pack) && vipWebCheckoutPack(_pack) == null)) {
      const message =
          'A compra de créditos VIP ainda não está disponível. '
          'Nenhum pagamento foi iniciado e nenhum crédito VIP foi adicionado.';
      _surfaceUserError(message);
      throw CardBrickUserException(message);
    }
    if (_submitLock || !_attempt.acceptsSubmit) {
      _surfaceUserError(cardDuplicateSubmitMessage);
      throw CardBrickUserException(cardDuplicateSubmitMessage);
    }
    _submitLock = true;
    final next = beginCardSubmit(_attempt, nextKey: _newKey);
    setState(() {
      _attempt = next;
      _brickError = null;
    });
    try {
      final api = context.read<ApiClient>();
      final raw = await api.post(
        '/credits/card/pay',
        body: cardPayBody(
          packageKey: _packageKey,
          idempotencyKey: next.idempotencyKey,
          token: form.token,
          paymentMethodId: form.paymentMethodId,
          fiscal: _fiscal.toApiPayload(),
        ),
      );
      final step = applyCardPayResult(next, CardPayResult.parse(raw));
      _commit(step, startPoll: true);
      if (step.rejectBrick) {
        throw CardBrickUserException(step.attempt.message ?? cardRejectedMessage);
      }
    } on CardBrickUserException {
      rethrow;
    } catch (error) {
      final step = applyCardHttpFailure(next, error);
      _commit(step);
      throw CardBrickUserException(
        step.attempt.message ?? cardCommunicationMessage,
      );
    }
  }

  void _commit(CardAttemptStep step, {bool startPoll = false}) {
    if (!mounted) return;
    setState(() => _attempt = step.attempt);
    _submitLock = !step.attempt.acceptsSubmit;
    if (step.reloadWallet) {
      unawaited(_reloadWallet());
    }
    if (startPoll && step.poll && step.attempt.purchaseId != null) {
      _startPoll(step.attempt.purchaseId!);
    } else if (!step.poll) {
      _poller?.stop();
    }
  }

  void _startPoll(String purchaseId) {
    _poller?.dispose();
    final fetch = _fetchPurchaseStatus;
    final poller = widget.pollerFactory?.call(fetch) ??
        PixPurchasePoller(fetchStatus: fetch);
    _poller = poller;
    poller.start(
      purchaseId: purchaseId,
      onStatus: (status) {
        if (!mounted || _attempt.pollTimedOut) return;
        final step = applyCardPollStatus(_attempt, status);
        _commit(step);
      },
      onTimeout: () {
        if (!mounted || _attempt.phase == CardAttemptPhase.approved) return;
        setState(() => _attempt = markCardPollTimeout(_attempt));
      },
      onFatalError: (error) {
        if (!mounted || _attempt.phase == CardAttemptPhase.approved) return;
        setState(() {
          _attempt = _attempt.copyWith(message: friendlyCardError(error));
        });
      },
    );
  }

  Future<String> _fetchPurchaseStatus(String purchaseId) async {
    final api = context.read<ApiClient>();
    final body = await api.get('/credits/purchases/$purchaseId');
    final map = body is Map<String, dynamic>
        ? body
        : Map<String, dynamic>.from(body as Map);
    return map['status']?.toString() ?? 'PENDING';
  }

  Future<void> _reloadWallet() async {
    if (!mounted) return;
    setState(() => _refreshingWallet = true);
    try {
      final api = context.read<ApiClient>();
      final wallet = await api.get('/credits/wallet') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _walletBalance = walletBalanceFromResponse(wallet);
        _refreshingWallet = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _refreshingWallet = false);
    }
  }

  void _surfaceUserError(String message) {
    if (!mounted || message.isEmpty) return;
    if (_attempt.phase != CardAttemptPhase.ready) return;
    setState(() {
      _brickError = null;
      _attempt = _attempt.copyWith(message: message);
    });
  }

  void _onBrickError(String message) {
    if (!mounted || message.isEmpty) return;
    if (_attempt.phase != CardAttemptPhase.ready || _attempt.message != null) {
      return;
    }
    setState(() => _brickError = message);
  }

  @override
  Widget build(BuildContext context) {
    final attempt = _attempt;
    return PopScope(
      canPop: attempt.phase != CardAttemptPhase.submitting,
      child: Scaffold(
        backgroundColor: kCreditsBg,
        appBar: AppBar(
          backgroundColor: kCreditsBg,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: true,
          leading: IconButton(
            onPressed: attempt.phase == CardAttemptPhase.submitting
                ? null
                : () => Navigator.of(context).maybePop(
                      attempt.phase == CardAttemptPhase.approved,
                    ),
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
            color: kCreditsInk,
          ),
          title: const Text(
            'Finalizar pagamento',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: kCreditsInk,
            ),
          ),
        ),
        body: attempt.phase == CardAttemptPhase.approved
            ? _buildApproved()
            : Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: Column(
                    children: [
                      Expanded(
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                          children: [
                            _SummaryCard(
                              credits: _credits,
                              priceLabel: formatBrl(_catalogPrice),
                            ),
                            const SizedBox(height: 16),
                            _MethodCard(
                              method: _method,
                              enabled: attempt.allowsMethodSwitch,
                              onPix: _selectPix,
                              onCard: _selectCard,
                            ),
                            if (_method == _PayMethod.card) ...[
                              const SizedBox(height: 16),
                              _cardBody(attempt),
                            ],
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                        child: _bottom(attempt),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  Widget _cardBody(CardAttempt attempt) {
    if (_configLoading || !_catalogReady) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator(color: kCreditsAccent)),
      );
    }
    if (_configError != null) {
      return _StatusCard(message: _configError!);
    }
    return Column(
      children: [
        if (attempt.showsBrick && _publicKey != null) ...[
          FiscalInvoiceSection(
            controller: _fiscal,
            onChanged: () => setState(() {}),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Cartão de crédito',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: kCreditsInk,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'O número e o CVV são digitados no formulário do Mercado Pago. O After não guarda esses dados.',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 12,
                    height: 1.35,
                    color: Color(0xFF5A4A86),
                  ),
                ),
                const SizedBox(height: 12),
                CardBrickView(
                  key: ValueKey(_viewType),
                  host: _host,
                  viewType: _viewType,
                  publicKey: _publicKey!,
                  amount: _catalogPrice,
                  payerEmail: _payerEmail,
                  usePlatformView: _usePlatformView,
                  onSubmit: _onBrickSubmit,
                  onBrickError: _onBrickError,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _bottom(CardAttempt attempt) {
    if (_vipPaymentBlocked) {
      return const Text(
        'A compra de créditos VIP ainda não está disponível. '
        'Nenhum pagamento foi iniciado e nenhum crédito VIP foi adicionado.',
        key: Key('vip-checkout-blocked'),
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 13,
          height: 1.35,
          color: kCreditsInk,
        ),
      );
    }
    if (_method == _PayMethod.pix) {
      return Column(
        children: [
          CreditsPurpleButton(
            key: const Key('web-pay-pix'),
            label: 'Pagar com PIX',
            onPressed: attempt.allowsMethodSwitch ? _openPix : null,
          ),
          const SizedBox(height: 10),
          const Text(
            'Pagamento seguro via PIX',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 11,
              color: kCreditsMuted,
            ),
          ),
        ],
      );
    }
    final waiting = attempt.phase == CardAttemptPhase.pending ||
        attempt.phase == CardAttemptPhase.submitting ||
        attempt.phase == CardAttemptPhase.unknown ||
        attempt.phase == CardAttemptPhase.refunded;
    final notice = attempt.message ?? _brickError;
    return Column(
      children: [
        if (notice != null && notice.isNotEmpty) ...[
          _StatusCard(
            key: const Key('card-payment-notice'),
            message: notice,
            rejected: attempt.phase == CardAttemptPhase.rejected,
          ),
          const SizedBox(height: 12),
        ],
        if (waiting)
          CreditsPurpleButton(
            key: const Key('card-payment-status'),
            label: attempt.phase == CardAttemptPhase.submitting
                ? 'Processando pagamento'
                : attempt.phase == CardAttemptPhase.unknown
                    ? 'Pagamento não confirmado'
                    : 'Aguardando confirmação',
            loading: attempt.phase == CardAttemptPhase.submitting,
            onPressed: null,
          ),
        const SizedBox(height: 10),
        const Text(
          'Pagamento seguro via Mercado Pago',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 11,
            color: kCreditsMuted,
          ),
        ),
      ],
    );
  }

  Widget _buildApproved() {
    return SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _StatusCard(
                  title: 'Pagamento confirmado',
                  message: cardApprovedMessage,
                  icon: Icons.check_circle_rounded,
                  iconColor: const Color(0xFF22A45A),
                ),
                if (_refreshingWallet) ...[
                  const SizedBox(height: 16),
                  const CircularProgressIndicator(color: kCreditsAccent),
                ] else if (_walletBalance != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Saldo atual: $_walletBalance',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: kCreditsAccent,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                CreditsPurpleButton(
                  label: 'Voltar para créditos',
                  onPressed: () => Navigator.of(context).pop(true),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _PayMethod { pix, card }

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.credits, required this.priceLabel});

  final int credits;
  final String priceLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 14,
                backgroundColor: kCreditsSoft,
                child: Icon(Icons.star_rounded, size: 16, color: kCreditsAccent),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  credits == 1 ? '1 crédito' : '$credits créditos',
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: kCreditsInk,
                  ),
                ),
              ),
              Text(
                priceLabel,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: kCreditsAccent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF7F7F9),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'O valor vem do catálogo do After. O navegador não define o preço da compra.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 11,
                height: 1.35,
                color: Color(0xFF5A4A86),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MethodCard extends StatelessWidget {
  const _MethodCard({
    required this.method,
    required this.enabled,
    required this.onPix,
    required this.onCard,
  });

  final _PayMethod method;
  final bool enabled;
  final VoidCallback onPix;
  final VoidCallback onCard;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Forma de pagamento',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 12),
          _MethodTile(
            key: const Key('pay-method-pix'),
            icon: Icons.qr_code_2_rounded,
            label: 'PIX',
            selected: method == _PayMethod.pix,
            onTap: enabled ? onPix : null,
          ),
          const SizedBox(height: 8),
          _MethodTile(
            key: const Key('pay-method-card'),
            icon: Icons.credit_card_rounded,
            label: 'Cartão de crédito',
            selected: method == _PayMethod.card,
            onTap: enabled ? onCard : null,
          ),
        ],
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    super.key,
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? kCreditsSoft : const Color(0xFFF7F7F9),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? kCreditsAccent : const Color(0xFFC9C9D0),
                size: 20,
              ),
              const SizedBox(width: 10),
              Icon(icon, size: 20, color: kCreditsAccent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 13,
                    color: kCreditsInk,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    super.key,
    required this.message,
    this.title,
    this.icon,
    this.iconColor,
    this.rejected = false,
  });

  final String message;
  final String? title;
  final IconData? icon;
  final Color? iconColor;
  final bool rejected;

  static const _rejectedBackground = Color(0xFFFDE8E8);
  static const _rejectedForeground = Color(0xFFB42318);
  static const _rejectedBorder = Color(0xFFF5A3A3);

  @override
  Widget build(BuildContext context) {
    if (rejected) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: _rejectedBackground,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _rejectedBorder),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(
                Icons.error_outline_rounded,
                color: _rejectedForeground,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  height: 1.4,
                  color: _rejectedForeground,
                ),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          if (icon != null) ...[
            Icon(icon, color: iconColor ?? kCreditsAccent, size: 40),
            const SizedBox(height: 10),
          ],
          if (title != null) ...[
            Text(
              title!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 15,
                color: kCreditsInk,
              ),
            ),
            const SizedBox(height: 8),
          ],
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              height: 1.4,
              color: kCreditsInk,
            ),
          ),
        ],
      ),
    );
  }
}
