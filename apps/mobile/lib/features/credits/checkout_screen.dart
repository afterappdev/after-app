import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'credits_ui.dart';
import 'store_billing.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.pack});

  final Map<String, dynamic> pack;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _card = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  final _name = TextEditingController();
  final _cpf = TextEditingController();
  _PayMethod _method = _PayMethod.card;
  int _installments = 1;
  bool _paying = false;
  late final StoreBilling _store;
  String? _storePriceLabel;
  String? _storeError;

  int get _credits => asInt(widget.pack['credits']);
  double get _price => asMoney(widget.pack['priceBrl']);
  bool get _useStore => StoreBilling.isSupported;
  String get _storeProductId {
    final fromPack = widget.pack['storeProductId']?.toString() ?? '';
    if (fromPack.isNotEmpty) return fromPack;
    return storeProductIdFor(widget.pack['key']?.toString() ?? '');
  }

  String get _displayPrice => _storePriceLabel ?? formatBrl(_price);

  @override
  void initState() {
    super.initState();
    _store = StoreBilling()
      ..onUnfinishedPurchase = (purchase) async {
        await _confirmStorePurchase(purchase);
        if (mounted) Navigator.of(context).pop(true);
      };
    if (_useStore) {
      _prepareStore();
    }
  }

  @override
  void dispose() {
    _store.dispose();
    _card.dispose();
    _expiry.dispose();
    _cvv.dispose();
    _name.dispose();
    _cpf.dispose();
    super.dispose();
  }

  String _digits(String value) => value.replaceAll(RegExp(r'\D'), '');

  void _onCardChanged(String value) {
    final raw = _digits(value);
    final digits = raw.length > 16 ? raw.substring(0, 16) : raw;
    final groups = <String>[];
    for (var i = 0; i < digits.length; i += 4) {
      groups.add(digits.substring(i, i + 4 > digits.length ? digits.length : i + 4));
    }
    final formatted = groups.join(' ');
    if (formatted != value) {
      _card.value = TextEditingValue(
        text: formatted,
        selection: TextSelection.collapsed(offset: formatted.length),
      );
    }
  }

  void _onExpiryChanged(String value) {
    final raw = _digits(value);
    final digits = raw.length > 4 ? raw.substring(0, 4) : raw;
    var formatted = digits;
    if (digits.length >= 3) {
      formatted = '${digits.substring(0, 2)}/${digits.substring(2)}';
    }
    if (formatted != value) {
      _expiry.value = TextEditingValue(
        text: formatted,
        selection: TextSelection.collapsed(offset: formatted.length),
      );
    }
  }

  void _onCpfChanged(String value) {
    final raw = _digits(value);
    final d = raw.length > 11 ? raw.substring(0, 11) : raw;
    var f = d;
    if (d.length > 9) {
      f = '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}';
    } else if (d.length > 6) {
      f = '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6)}';
    } else if (d.length > 3) {
      f = '${d.substring(0, 3)}.${d.substring(3)}';
    }
    if (f != value) {
      _cpf.value = TextEditingValue(
        text: f,
        selection: TextSelection.collapsed(offset: f.length),
      );
    }
  }

  String get _pixCode =>
      'AFTER-PIX-DEMO-${_credits}CREDITOS-${_price.toStringAsFixed(2).replaceAll('.', '')}';

  String get _boletoLine {
    final cents = (_price * 100).round().toString().padLeft(10, '0');
    return '23793.38128 60007.827039 00000.001016 1 $cents';
  }

  DateTime get _boletoDue {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day).add(const Duration(days: 3));
  }

  String _fmtDue(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Future<void> _prepareStore() async {
    try {
      final info = await _store.loadProduct(_storeProductId);
      if (!mounted) return;
      setState(() {
        _storePriceLabel = info?.price;
        _storeError = info == null
            ? 'Produto ainda não publicado na ${StoreBilling.providerLabel}.'
            : null;
      });
    } on StoreBillingException catch (e) {
      if (!mounted) return;
      setState(() => _storeError = e.message);
    }
  }

  Future<void> _confirmStorePurchase(StorePurchase purchase) async {
    final api = context.read<ApiClient>();
    await api.post('/credits/store-confirm', body: {
      'packageKey': widget.pack['key'],
      'productId': purchase.productId,
      'provider': purchase.provider,
      'purchaseId': purchase.purchaseId,
      'verificationData': purchase.verificationData,
    });
    await _store.complete(purchase);
  }

  String? _validate() {
    if (_digits(_cpf.text).length != 11) return 'Informe um CPF válido.';
    if (_method == _PayMethod.card) {
      if (_digits(_card.text).length < 16) return 'Informe o número do cartão.';
      final exp = _digits(_expiry.text);
      if (exp.length != 4) return 'Informe a validade no formato MM/AA.';
      final mm = int.tryParse(exp.substring(0, 2)) ?? 0;
      if (mm < 1 || mm > 12) return 'Mês de validade inválido.';
      if (_digits(_cvv.text).length < 3) return 'Informe o CVV.';
      if (_name.text.trim().length < 3) return 'Informe o nome impresso no cartão.';
    }
    return null;
  }

  Future<void> _copy(String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _pay() async {
    if (_useStore) {
      await _payWithStore();
      return;
    }
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _paying = true);
    try {
      final api = context.read<ApiClient>();
      final result = await api.post(
        '/credits/checkout',
        body: {'packageKey': widget.pack['key']},
      ) as Map<String, dynamic>;
      final purchaseId = (result['purchase'] as Map<String, dynamic>)['id'] as String;
      await api.post('/credits/dev-confirm/$purchaseId');
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  Future<void> _payWithStore() async {
    setState(() => _paying = true);
    try {
      final purchase = await _store.purchase(_storeProductId);
      await _confirmStorePurchase(purchase);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on StoreBillingException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final twoX = _price * 1.025 / 2;
    final threeX = _price * 1.005 / 3;

    return Scaffold(
      backgroundColor: kCreditsBg,
      appBar: AppBar(
        backgroundColor: kCreditsBg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
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
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    _SectionCard(
                      title: 'Resumo da compra',
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
                                  _credits == 1 ? '1 crédito' : '$_credits créditos',
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: kCreditsInk,
                                  ),
                                ),
                              ),
                              Text(
                                _displayPrice,
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
                          Row(
                            children: [
                              const Text(
                                'Total',
                                style: TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                  color: kCreditsInk,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                _displayPrice,
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
                              color: kCreditsSoft,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.lock_outline, size: 16, color: kCreditsAccent),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _useStore
                                        ? StoreBilling.isApple
                                            ? 'O pagamento é processado pela Apple. Nenhum dado de cartão passa pelo After.'
                                            : 'O pagamento é processado pelo Google Play. Nenhum dado de cartão passa pelo After.'
                                        : 'Seus dados estão protegidos e não são armazenados em nossos servidores.',
                                    style: const TextStyle(
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
                    _SectionCard(
                      title: 'Forma de pagamento',
                      child: _useStore
                          ? Column(
                              children: [
                                _MethodTile(
                                  iconWidget: FaIcon(
                                    StoreBilling.isApple
                                        ? FontAwesomeIcons.apple
                                        : FontAwesomeIcons.googlePlay,
                                    size: 18,
                                    color: kCreditsAccent,
                                  ),
                                  label: StoreBilling.isApple
                                      ? 'Apple'
                                      : 'Google Play',
                                  selected: true,
                                  onTap: () {},
                                ),
                                if (_storeError != null) ...[
                                  const SizedBox(height: 10),
                                  Text(
                                    _storeError!,
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 12,
                                      height: 1.35,
                                      color: Color(0xFFB3261E),
                                    ),
                                  ),
                                ] else ...[
                                  const SizedBox(height: 10),
                                  Text(
                                    StoreBilling.isApple
                                        ? 'O pagamento será concluído com o ID Apple, conforme as regras da App Store.'
                                        : 'O pagamento será concluído com a conta Google Play, conforme as regras da loja.',
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 12,
                                      height: 1.35,
                                      color: kCreditsMuted,
                                    ),
                                  ),
                                ],
                              ],
                            )
                          : Column(
                              children: [
                                _MethodTile(
                                  icon: Icons.credit_card_outlined,
                                  label: 'Cartão de crédito',
                                  selected: _method == _PayMethod.card,
                                  onTap: () => setState(() => _method = _PayMethod.card),
                                ),
                                const SizedBox(height: 8),
                                _MethodTile(
                                  icon: Icons.qr_code_2_rounded,
                                  label: 'PIX',
                                  selected: _method == _PayMethod.pix,
                                  onTap: () => setState(() => _method = _PayMethod.pix),
                                ),
                                const SizedBox(height: 8),
                                _MethodTile(
                                  icon: Icons.receipt_long_outlined,
                                  label: 'Boleto bancário',
                                  selected: _method == _PayMethod.boleto,
                                  onTap: () => setState(() => _method = _PayMethod.boleto),
                                ),
                              ],
                            ),
                    ),
                    if (!_useStore) ...[
                    const SizedBox(height: 16),
                    _SectionCard(
                      title: 'Dados do comprador',
                      child: CreditsField(
                        label: 'CPF',
                        controller: _cpf,
                        hint: '000.000.000-00',
                        keyboardType: TextInputType.number,
                        onChanged: _onCpfChanged,
                      ),
                    ),
                    if (_method == _PayMethod.card) ...[
                      const SizedBox(height: 16),
                      _SectionCard(
                        title: 'Dados do cartão',
                        child: Column(
                          children: [
                            CreditsField(
                              label: 'Número do cartão',
                              controller: _card,
                              hint: 'ACCT-000003',
                              keyboardType: TextInputType.number,
                              prefixIcon: const Icon(Icons.credit_card_outlined, color: kCreditsMuted),
                              onChanged: _onCardChanged,
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: CreditsField(
                                    label: 'Validade',
                                    controller: _expiry,
                                    hint: 'MM/AA',
                                    keyboardType: TextInputType.number,
                                    onChanged: _onExpiryChanged,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: CreditsField(
                                    label: 'CVV',
                                    controller: _cvv,
                                    hint: '000',
                                    keyboardType: TextInputType.number,
                                    maxLength: 4,
                                    suffixIcon: const Icon(Icons.info_outline, size: 18, color: kCreditsMuted),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            CreditsField(
                              label: 'Nome no cartão',
                              controller: _name,
                              hint: 'Nome impresso no cartão',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      _SectionCard(
                        title: 'Parcelas',
                        child: Column(
                          children: [
                            _InstallmentTile(
                              label: 'À vista',
                              value: formatBrl(_price),
                              selected: _installments == 1,
                              onTap: () => setState(() => _installments = 1),
                            ),
                            const SizedBox(height: 8),
                            _InstallmentTile(
                              label: '2x de ${formatBrl(twoX)}',
                              value: '',
                              selected: _installments == 2,
                              onTap: () => setState(() => _installments = 2),
                            ),
                            const SizedBox(height: 8),
                            _InstallmentTile(
                              label: '3x de ${formatBrl(threeX)}',
                              value: '',
                              selected: _installments == 3,
                              onTap: () => setState(() => _installments = 3),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_method == _PayMethod.pix) ...[
                      const SizedBox(height: 16),
                      _SectionCard(
                        title: 'Pagar com PIX',
                        child: Column(
                          children: [
                            Container(
                              width: 148,
                              height: 148,
                              decoration: BoxDecoration(
                                color: kCreditsSoft,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: kCreditsAccent.withValues(alpha: 0.35)),
                              ),
                              child: const Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.qr_code_2_rounded, size: 72, color: kCreditsAccent),
                                  SizedBox(height: 6),
                                  Text(
                                    'QR Code PIX',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: kCreditsAccent,
                                    ),
                                  ),
                                ],
                              ),
                            ),
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
                                      _pixCode,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 11,
                                        color: kCreditsInk,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => _copy(_pixCode, 'Código PIX copiado.'),
                                    child: const Text('Copiar'),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_method == _PayMethod.boleto) ...[
                      const SizedBox(height: 16),
                      _SectionCard(
                        title: 'Pagar com boleto',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Vencimento',
                                  style: TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontSize: 13,
                                    color: kCreditsMuted,
                                  ),
                                ),
                                const Spacer(),
                                Text(
                                  _fmtDue(_boletoDue),
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: kCreditsInk,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Linha digitável',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF4A4A52),
                              ),
                            ),
                            const SizedBox(height: 6),
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
                                      _boletoLine,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: kCreditsInk,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => _copy(_boletoLine, 'Linha digitável copiada.'),
                                    child: const Text('Copiar'),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'O boleto vence em 3 dias. Em ambiente de testes, a compensação é simulada na hora.',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 12,
                                height: 1.35,
                                color: kCreditsMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    ],
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Text(
                          'Total a pagar',
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: kCreditsInk,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          _displayPrice,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: kCreditsAccent,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    CreditsPurpleButton(
                      label: _useStore
                          ? 'Pagar com ${StoreBilling.providerLabel} $_displayPrice'
                          : _method == _PayMethod.pix
                              ? 'Pagar com PIX ${formatBrl(_price)}'
                              : _method == _PayMethod.boleto
                                  ? 'Gerar boleto ${formatBrl(_price)}'
                                  : 'Finalizar pagamento ${formatBrl(_price)}',
                      icon: _useStore
                          ? Icons.lock_outline
                          : _method == _PayMethod.pix
                              ? Icons.qr_code_2_rounded
                              : _method == _PayMethod.boleto
                                  ? Icons.receipt_long_outlined
                                  : Icons.lock_outline,
                      loading: _paying,
                      onPressed: _useStore && _storeError != null ? null : _pay,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _useStore
                          ? StoreBilling.isApple
                              ? 'Pagamento seguro via Apple In-App Purchase'
                              : 'Pagamento seguro via Google Play Billing'
                          : 'Pagamento seguro via cartão, PIX ou boleto',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 11,
                        color: kCreditsMuted,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text.rich(
                      TextSpan(
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 10,
                          color: kCreditsMuted,
                        ),
                        children: [
                          const TextSpan(text: 'Ao finalizar, você concorda com nossos '),
                          TextSpan(
                            text: 'Termos de Uso',
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              color: kCreditsAccent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const TextSpan(text: ' e '),
                          TextSpan(
                            text: 'Política de Privacidade',
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              color: kCreditsAccent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      textAlign: TextAlign.center,
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

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

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

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    this.icon,
    this.iconWidget,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData? icon;
  final Widget? iconWidget;
  final String label;
  final bool selected;
  final VoidCallback onTap;

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
              iconWidget ??
                  Icon(
                    icon,
                    size: 20,
                    color: selected ? kCreditsAccent : kCreditsMuted,
                  ),
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

enum _PayMethod { card, pix, boleto }

class _InstallmentTile extends StatelessWidget {
  const _InstallmentTile({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

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
              if (value.isNotEmpty)
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
          ),
        ),
      ),
    );
  }
}
