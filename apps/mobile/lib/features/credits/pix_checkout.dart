import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'billing_channel.dart';
import 'credits_ui.dart';
import 'pix_charge.dart';
import 'pix_poller.dart';
import 'purchase_labels.dart';

class PixCheckoutScreen extends StatefulWidget {
  const PixCheckoutScreen({super.key, required this.pack});

  final Map<String, dynamic> pack;

  @override
  State<PixCheckoutScreen> createState() => _PixCheckoutScreenState();
}

class _PixCheckoutScreenState extends State<PixCheckoutScreen> {
  late final PixPurchasePoller _poller;
  bool _creating = true;
  bool _refreshingWallet = false;
  String? _error;
  PixCharge? _charge;
  int? _walletBalance;

  int get _credits => asInt(widget.pack['credits']);
  double get _catalogPrice => asMoney(widget.pack['priceBrl']);
  String get _packageKey => widget.pack['key']?.toString() ?? '';

  bool get _paid => (_charge?.status ?? '').toUpperCase() == 'PAID';
  bool get _failedTerminal {
    final status = (_charge?.status ?? '').toUpperCase();
    return status == 'FAILED' || status == 'CANCELLED' || status == 'REFUNDED';
  }

  @override
  void initState() {
    super.initState();
    _poller = PixPurchasePoller(
      fetchStatus: _fetchPurchaseStatus,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _createCharge());
  }

  @override
  void dispose() {
    _poller.dispose();
    super.dispose();
  }

  Future<String> _fetchPurchaseStatus(String purchaseId) async {
    final api = context.read<ApiClient>();
    final body = await api.get('/credits/purchases/$purchaseId');
    final map = body is Map<String, dynamic>
        ? body
        : Map<String, dynamic>.from(body as Map);
    return (map['status']?.toString() ?? 'PENDING');
  }

  Future<void> _createCharge() async {
    _poller.stop();
    setState(() {
      _creating = true;
      _error = null;
      _charge = null;
      _walletBalance = null;
    });
    try {
      final api = context.read<ApiClient>();
      final result = await api.post(
        '/credits/pix/create',
        body: pixCreateBody(_packageKey),
      );
      if (!mounted) return;
      final map = result is Map<String, dynamic>
          ? result
          : Map<String, dynamic>.from(result as Map);
      final charge = PixCharge.fromResponse(map);
      setState(() {
        _charge = charge;
        _creating = false;
      });
      final purchaseId = charge.purchaseId;
      if (purchaseId != null) {
        _poller.start(
          purchaseId: purchaseId,
          onStatus: _onPolledStatus,
          onTimeout: _onPollTimeout,
          onFatalError: _onPollFatalError,
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = friendlyPixError(error);
      });
    }
  }

  void _onPolledStatus(String status) {
    if (!mounted) return;
    final previous = _charge;
    setState(() {
      _charge = (previous ?? const PixCharge()).withStatus(status);
    });
    if (status.toUpperCase() == 'PAID') {
      _reloadWalletAfterPaid();
    }
  }

  Future<void> _reloadWalletAfterPaid() async {
    setState(() => _refreshingWallet = true);
    try {
      final api = context.read<ApiClient>();
      final wallet = await api.get('/credits/wallet') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _walletBalance = walletBalanceFromResponse(wallet);
        _refreshingWallet = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() => _refreshingWallet = false);
    }
  }

  void _onPollTimeout() {
    if (!mounted || _paid) return;
    setState(() {
      _error ??=
          'Ainda não identificamos o pagamento. Você pode voltar e consultar o histórico.';
    });
  }

  void _onPollFatalError(Object error) {
    if (!mounted || _paid) return;
    setState(() {
      _error = friendlyPixError(error);
    });
  }

  Future<void> _copyPix() async {
    final code = _charge?.qrCodeText;
    if (code == null || code.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código PIX copiado.')),
    );
  }

  String _fmtExpires(DateTime d) {
    final local = d.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day/$month/${local.year} • $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCreditsBg,
      appBar: AppBar(
        backgroundColor: kCreditsBg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(_paid),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: kCreditsInk,
        ),
        title: const Text(
          'Pagar com PIX',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: kCreditsInk,
          ),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    _PixSectionCard(
                      title: 'Resumo da compra',
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const CircleAvatar(
                                radius: 14,
                                backgroundColor: kCreditsSoft,
                                child: Icon(
                                  Icons.star_rounded,
                                  size: 16,
                                  color: kCreditsAccent,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _credits == 1
                                      ? '1 crédito'
                                      : '$_credits créditos',
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: kCreditsInk,
                                  ),
                                ),
                              ),
                              Text(
                                formatBrl(_catalogPrice),
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: kCreditsInk,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          const Divider(height: 1),
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: kCreditsSoft,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Row(
                              children: [
                                Icon(
                                  Icons.lock_outline,
                                  size: 16,
                                  color: kCreditsAccent,
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'O pagamento é confirmado pelo servidor. O app não marca a compra como paga.',
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
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _PixSectionCard(
                      title: 'Forma de pagamento',
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: kCreditsSoft,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Row(
                          children: [
                            Icon(
                              Icons.radio_button_checked,
                              color: kCreditsAccent,
                              size: 20,
                            ),
                            SizedBox(width: 10),
                            Icon(
                              Icons.qr_code_2_rounded,
                              size: 20,
                              color: kCreditsAccent,
                            ),
                            SizedBox(width: 10),
                            Text(
                              'PIX',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: kCreditsInk,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_creating)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(
                          child: CircularProgressIndicator(color: kCreditsAccent),
                        ),
                      )
                    else if (_paid)
                      _PixSectionCard(
                        title: 'Pagamento confirmado',
                        child: Column(
                          children: [
                            const Icon(
                              Icons.check_circle_rounded,
                              color: Color(0xFF22A45A),
                              size: 48,
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Seus créditos já estão na carteira.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 13,
                                height: 1.35,
                                color: kCreditsInk,
                              ),
                            ),
                            if (_refreshingWallet) ...[
                              const SizedBox(height: 12),
                              const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.4,
                                  color: kCreditsAccent,
                                ),
                              ),
                            ] else if (_walletBalance != null) ...[
                              const SizedBox(height: 12),
                              Text(
                                'Saldo atual: $_walletBalance',
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                  color: kCreditsAccent,
                                ),
                              ),
                            ],
                          ],
                        ),
                      )
                    else if (_error != null && _charge == null)
                      _PixSectionCard(
                        title: 'PIX',
                        child: Column(
                          children: [
                            const Icon(
                              Icons.info_outline,
                              color: kCreditsAccent,
                              size: 36,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 14,
                                height: 1.4,
                                color: kCreditsInk,
                              ),
                            ),
                          ],
                        ),
                      )
                    else if (_charge != null)
                      _PixSectionCard(
                        title: 'Pagar com PIX',
                        child: Column(
                          children: [
                            if (_error != null) ...[
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontSize: 13,
                                  height: 1.35,
                                  color: kCreditsInk,
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            _PixChargeBody(
                              charge: _charge!,
                              failed: _failedTerminal,
                              onCopy: _charge!.hasCopyPaste ? _copyPix : null,
                              formatExpires: _fmtExpires,
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                child: Column(
                  children: [
                    if (_paid)
                      CreditsPurpleButton(
                        label: 'Voltar para créditos',
                        onPressed: () => Navigator.of(context).pop(true),
                      )
                    else if (_error != null)
                      CreditsPurpleButton(
                        label: 'Tentar novamente',
                        loading: _creating,
                        onPressed: _createCharge,
                      )
                    else
                      CreditsPurpleButton(
                        label: _creating
                            ? 'Gerando PIX'
                            : 'Aguardando pagamento',
                        loading: _creating,
                        onPressed: null,
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
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PixChargeBody extends StatelessWidget {
  const _PixChargeBody({
    required this.charge,
    required this.failed,
    required this.formatExpires,
    this.onCopy,
  });

  final PixCharge charge;
  final bool failed;
  final VoidCallback? onCopy;
  final String Function(DateTime) formatExpires;

  @override
  Widget build(BuildContext context) {
    final status = purchaseStatusLabel(charge.status ?? 'PENDING');
    final amount = charge.amount;
    final currency = charge.currency;
    final expires = charge.expiresAt;

    return Column(
      children: [
        if (charge.hasQrImage)
          _PixQrImage(data: charge.qrCodeImage!)
        else if (!failed)
          const Text(
            'O QR Code será exibido quando o pagamento estiver disponível.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              height: 1.35,
              color: kCreditsMuted,
            ),
          ),
        if (charge.hasCopyPaste) ...[
          const SizedBox(height: 14),
          const Text(
            'Escaneie o QR Code ou copie o código para pagar no app do seu banco.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              height: 1.35,
              color: kCreditsMuted,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF7F7F9),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    charge.qrCodeText!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 11,
                      color: kCreditsInk,
                    ),
                  ),
                ),
                if (onCopy != null)
                  TextButton(
                    onPressed: onCopy,
                    child: const Text('Copiar'),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        if (amount != null)
          _PixMetaRow(
            label: 'Valor',
            value: currency == null || currency == 'BRL'
                ? formatBrl(amount)
                : '$currency ${amount.toStringAsFixed(2)}',
          ),
        if (expires != null) ...[
          const SizedBox(height: 8),
          _PixMetaRow(label: 'Vencimento', value: formatExpires(expires)),
        ],
        const SizedBox(height: 8),
        _PixMetaRow(label: 'Status', value: status),
        if (!failed && (charge.status ?? 'PENDING').toUpperCase() == 'PENDING') ...[
          const SizedBox(height: 12),
          const Text(
            'Aguardando pagamento',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: kCreditsAccent,
            ),
          ),
        ],
      ],
    );
  }
}

class _PixQrImage extends StatelessWidget {
  const _PixQrImage({required this.data});

  final String data;

  @override
  Widget build(BuildContext context) {
    Widget? image;
    if (data.startsWith('http://') || data.startsWith('https://')) {
      image = Image.network(data, fit: BoxFit.contain);
    } else {
      final payload = data.startsWith('data:')
          ? data.substring(data.indexOf(',') + 1)
          : data;
      try {
        image = Image.memory(base64Decode(payload), fit: BoxFit.contain);
      } catch (_) {
        image = null;
      }
    }
    if (image == null) return const SizedBox.shrink();
    return Container(
      width: 180,
      height: 180,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCreditsAccent.withValues(alpha: 0.35)),
      ),
      child: image,
    );
  }
}

class _PixMetaRow extends StatelessWidget {
  const _PixMetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 13,
            color: kCreditsMuted,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w700,
            fontSize: 13,
            color: kCreditsInk,
          ),
        ),
      ],
    );
  }
}

class _PixSectionCard extends StatelessWidget {
  const _PixSectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

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
          Text(
            title,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}
