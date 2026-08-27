import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'billing_channel.dart';
import 'credits_ui.dart';
import 'pix_checkout.dart';
import 'store_billing.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.pack});

  final Map<String, dynamic> pack;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  bool _paying = false;
  StoreBilling? _store;
  String? _storePriceLabel;
  String? _storeError;

  int get _credits => asInt(widget.pack['credits']);
  double get _price => asMoney(widget.pack['priceBrl']);
  bool get _useStore => billingUsesStore();
  String get _storeProductId {
    final fromPack = widget.pack['storeProductId']?.toString() ?? '';
    if (fromPack.isNotEmpty) return fromPack;
    return storeProductIdFor(widget.pack['key']?.toString() ?? '');
  }

  String get _displayPrice => _storePriceLabel ?? formatBrl(_price);

  @override
  void initState() {
    super.initState();
    if (!_useStore) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => PixCheckoutScreen(pack: widget.pack),
          ),
        );
      });
      return;
    }
    _store = StoreBilling()
      ..onUnfinishedPurchase = (purchase) async {
        await _confirmStorePurchase(purchase);
        if (mounted) Navigator.of(context).pop(true);
      };
    _prepareStore();
  }

  @override
  void dispose() {
    _store?.dispose();
    super.dispose();
  }

  Future<void> _prepareStore() async {
    final store = _store;
    if (store == null) return;
    try {
      final info = await store.loadProduct(_storeProductId);
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
    await _store!.complete(purchase);
  }

  Future<void> _payWithStore() async {
    setState(() => _paying = true);
    try {
      final purchase = await _store!.purchase(_storeProductId);
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
    if (!_useStore) {
      return const Scaffold(
        backgroundColor: kCreditsBg,
        body: Center(child: CircularProgressIndicator(color: kCreditsAccent)),
      );
    }

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
                                    StoreBilling.isApple
                                        ? 'O pagamento é processado pela Apple. Nenhum dado de cartão passa pelo After.'
                                        : 'O pagamento é processado pelo Google Play. Nenhum dado de cartão passa pelo After.',
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
                      child: Column(
                        children: [
                          _MethodTile(
                            iconWidget: FaIcon(
                              StoreBilling.isApple
                                  ? FontAwesomeIcons.apple
                                  : FontAwesomeIcons.googlePlay,
                              size: 18,
                              color: kCreditsAccent,
                            ),
                            label: StoreBilling.isApple ? 'Apple' : 'Google Play',
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
                      ),
                    ),
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
                      label: 'Pagar com ${StoreBilling.providerLabel} $_displayPrice',
                      icon: Icons.lock_outline,
                      loading: _paying,
                      onPressed: _storeError != null ? null : _payWithStore,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      StoreBilling.isApple
                          ? 'Pagamento seguro via Apple In-App Purchase'
                          : 'Pagamento seguro via Google Play Billing',
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
    this.iconWidget,
    required this.label,
    required this.selected,
    required this.onTap,
  });

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
                  const Icon(Icons.storefront_outlined, size: 20, color: kCreditsAccent),
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
