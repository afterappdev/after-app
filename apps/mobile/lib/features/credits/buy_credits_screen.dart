import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'billing_channel.dart';
import 'checkout_screen.dart';
import 'credits_ui.dart';
import 'pix_checkout.dart';
import 'pix_pending_reconcile.dart';
import 'purchase_labels.dart';

class BuyCreditsScreen extends StatefulWidget {
  const BuyCreditsScreen({
    super.key,
    this.reconcilePendingPix,
    this.usePixCheckout,
  });

  /// When null, follows [billingUsesPix] (Web yes, Android/iOS no).
  final bool? reconcilePendingPix;

  /// When null, follows [billingUsesPix] for checkout destination.
  final bool? usePixCheckout;

  @override
  State<BuyCreditsScreen> createState() => _BuyCreditsScreenState();
}

class _BuyCreditsScreenState extends State<BuyCreditsScreen> {
  bool _loading = true;
  String? _error;
  int _balance = 0;
  List<dynamic> _packages = [];
  List<dynamic> _purchases = [];
  String? _selectedKey;
  bool _showAllPurchases = false;

  bool get _reconcilePendingPix =>
      widget.reconcilePendingPix ?? billingUsesPix();

  bool get _usePixCheckout => widget.usePixCheckout ?? billingUsesPix();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final wallet = await api.get('/credits/wallet') as Map<String, dynamic>;
      final packages = await api.get('/credits/packages') as List<dynamic>;
      final purchases = await api.get('/credits/purchases') as List<dynamic>;
      if (!mounted) return;
      setState(() {
        _balance = wallet['balance'] as int? ?? 0;
        _packages = packages;
        _purchases = purchases;
        _selectedKey ??= packages.isNotEmpty
            ? (packages.last as Map)['key']?.toString()
            : null;
        _loading = false;
      });
      if (_reconcilePendingPix) {
        await _reconcilePendingPixPurchases();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.statusCode == 401
            ? friendlyPixError(e)
            : e.message;
        _loading = false;
      });
    }
  }

  Future<void> _reconcilePendingPixPurchases() async {
    final api = context.read<ApiClient>();
    final snapshot = List<dynamic>.from(_purchases);
    final result = await reconcilePendingPixPurchases(
      purchases: snapshot,
      fetchById: (id) async {
        final body = await api.get('/credits/purchases/$id');
        return Map<String, dynamic>.from(body as Map);
      },
    );
    if (!mounted) return;
    setState(() => _purchases = result.purchases);
    if (!result.anyBecamePaid) return;
    final wallet = await api.get('/credits/wallet') as Map<String, dynamic>;
    if (!mounted) return;
    setState(() {
      _balance = wallet['balance'] as int? ?? 0;
    });
  }

  Map<String, dynamic>? get _selected {
    for (final item in _packages) {
      final map = item as Map<String, dynamic>;
      if (map['key']?.toString() == _selectedKey) return map;
    }
    return _packages.isEmpty ? null : _packages.last as Map<String, dynamic>;
  }

  Future<void> _continue() async {
    final pack = _selected;
    if (pack == null) return;
    final dest = _usePixCheckout
        ? PixCheckoutScreen(pack: pack)
        : CheckoutScreen(pack: pack);
    final paid = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => dest),
    );
    if (!mounted) return;
    if (paid == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Créditos adicionados à sua carteira.')),
      );
    }
    await _load();
  }

  void _scrollToPurchases() {
    setState(() => _showAllPurchases = true);
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final visiblePurchases = _showAllPurchases ? _purchases : _purchases.take(3).toList();

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
          'Comprar créditos',
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
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: kCreditsAccent))
              : _error != null
                  ? Center(child: Text(_error!, style: const TextStyle(fontFamily: AppTheme.fontFamily)))
                  : Column(
                      children: [
                        Expanded(
                          child: RefreshIndicator(
                            color: kCreditsAccent,
                            onRefresh: _load,
                            child: ListView(
                              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                              children: [
                                _BalanceCard(
                                  balance: _balance,
                                  onHistory: _purchases.isEmpty ? null : _scrollToPurchases,
                                ),
                                const SizedBox(height: 22),
                                const Text(
                                  'Escolha um pacote',
                                  style: TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                    color: kCreditsInk,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                ..._packages.map((item) {
                                  final pack = item as Map<String, dynamic>;
                                  final key = pack['key']?.toString() ?? '';
                                  final credits = asInt(pack['credits']);
                                  final price = asMoney(pack['priceBrl']);
                                  final selectedPack = key == _selectedKey;
                                  final save = packageSavings(pack, _packages);
                                  final unit = credits == 0 ? 0 : price / credits;
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: Material(
                                      color: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                        side: BorderSide(
                                          color: selectedPack ? kCreditsAccent : const Color(0xFFE4E4EA),
                                          width: selectedPack ? 1.8 : 1,
                                        ),
                                      ),
                                      child: InkWell(
                                        onTap: () => setState(() => _selectedKey = key),
                                        borderRadius: BorderRadius.circular(16),
                                        child: Padding(
                                          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                                          child: Column(
                                            children: [
                                              Row(
                                                children: [
                                                  Icon(
                                                    selectedPack ? Icons.radio_button_checked : Icons.radio_button_off,
                                                    color: selectedPack ? kCreditsAccent : const Color(0xFFC9C9D0),
                                                  ),
                                                  const SizedBox(width: 10),
                                                  const CircleAvatar(
                                                    radius: 14,
                                                    backgroundColor: kCreditsSoft,
                                                    child: Icon(Icons.star_rounded, size: 16, color: kCreditsAccent),
                                                  ),
                                                  const SizedBox(width: 10),
                                                  Expanded(
                                                    child: Column(
                                                      crossAxisAlignment: CrossAxisAlignment.start,
                                                      children: [
                                                        Text(
                                                          credits == 1 ? '1 crédito' : '$credits créditos',
                                                          style: const TextStyle(
                                                            fontFamily: AppTheme.fontFamily,
                                                            fontWeight: FontWeight.w800,
                                                            fontSize: 15,
                                                            color: kCreditsInk,
                                                          ),
                                                        ),
                                                        Text(
                                                          packageSubtitle(credits),
                                                          style: const TextStyle(
                                                            fontFamily: AppTheme.fontFamily,
                                                            fontSize: 12,
                                                            color: kCreditsMuted,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                  Text(
                                                    formatBrl(price),
                                                    style: const TextStyle(
                                                      fontFamily: AppTheme.fontFamily,
                                                      fontWeight: FontWeight.w800,
                                                      fontSize: 16,
                                                      color: kCreditsAccent,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 8),
                                              Row(
                                                children: [
                                                  const SizedBox(width: 34),
                                                  Text(
                                                    '${formatBrl(unit)} por crédito',
                                                    style: const TextStyle(
                                                      fontFamily: AppTheme.fontFamily,
                                                      fontSize: 11,
                                                      color: kCreditsMuted,
                                                    ),
                                                  ),
                                                  if (save != null) ...[
                                                    const SizedBox(width: 10),
                                                    Text(
                                                      'Economize ${formatBrl(save)}',
                                                      style: const TextStyle(
                                                        fontFamily: AppTheme.fontFamily,
                                                        fontWeight: FontWeight.w700,
                                                        fontSize: 11,
                                                        color: kCreditsAccent,
                                                      ),
                                                    ),
                                                  ],
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                                if (_purchases.isNotEmpty) ...[
                                  const SizedBox(height: 18),
                                  Row(
                                    children: [
                                      const Text(
                                        'Últimas compras',
                                        style: TextStyle(
                                          fontFamily: AppTheme.fontFamily,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 16,
                                          color: kCreditsInk,
                                        ),
                                      ),
                                      const Spacer(),
                                      if (_purchases.length > 3)
                                        TextButton(
                                          onPressed: () => setState(() => _showAllPurchases = !_showAllPurchases),
                                          child: Text(_showAllPurchases ? 'Ver menos' : 'Ver todas →'),
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  ...visiblePurchases.map((item) {
                                    final purchase = item as Map<String, dynamic>;
                                    final credits = asInt(purchase['credits']);
                                    final paid = asMoney(purchase['amountPaid']);
                                    final status = purchase['status']?.toString() ?? '';
                                    final provider = purchaseProviderLabel(
                                      purchase['provider']?.toString(),
                                    );
                                    final statusLabel = purchaseStatusLabel(status);
                                    final isPaid = status == 'PAID';
                                    final failed = status == 'FAILED' ||
                                        status == 'CANCELLED';
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  credits == 1 ? '1 crédito' : '$credits créditos',
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    fontFamily: AppTheme.fontFamily,
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14,
                                                    color: kCreditsInk,
                                                  ),
                                                ),
                                                if (provider.isNotEmpty)
                                                  Text(
                                                    provider,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      fontFamily: AppTheme.fontFamily,
                                                      fontSize: 12,
                                                      color: kCreditsMuted,
                                                    ),
                                                  ),
                                                Text(
                                                  formatPurchaseDate(purchase['createdAt']),
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    fontFamily: AppTheme.fontFamily,
                                                    fontSize: 12,
                                                    color: kCreditsMuted,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Text(
                                            formatBrl(paid),
                                            style: const TextStyle(
                                              fontFamily: AppTheme.fontFamily,
                                              fontWeight: FontWeight.w800,
                                              fontSize: 13,
                                              color: kCreditsAccent,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          FittedBox(
                                            fit: BoxFit.scaleDown,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                              decoration: BoxDecoration(
                                                color: isPaid
                                                    ? const Color(0xFFE6F6EC)
                                                    : failed
                                                        ? const Color(0xFFFDECEC)
                                                        : const Color(0xFFF0F0F3),
                                                borderRadius: BorderRadius.circular(20),
                                              ),
                                              child: Text(
                                                statusLabel,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontFamily: AppTheme.fontFamily,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                  color: isPaid
                                                      ? const Color(0xFF22A45A)
                                                      : failed
                                                          ? const Color(0xFFB3261E)
                                                          : kCreditsMuted,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }),
                                ],
                              ],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                          child: Column(
                            children: [
                              CreditsPurpleButton(
                                label: 'Continuar para pagamento',
                                subtitle: selected == null ? null : 'Total: ${formatBrl(asMoney(selected['priceBrl']))}',
                                onPressed: selected == null ? null : _continue,
                              ),
                              const SizedBox(height: 8),
                              const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.lock_outline, size: 14, color: kCreditsMuted),
                                  SizedBox(width: 6),
                                  Text(
                                    'Pagamento 100% seguro',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 11,
                                      color: kCreditsMuted,
                                    ),
                                  ),
                                ],
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

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance, this.onHistory});

  final int balance;
  final VoidCallback? onHistory;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 22,
                backgroundColor: kCreditsSoft,
                child: Icon(Icons.star_rounded, color: kCreditsAccent, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Saldo atual',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 12,
                        color: kCreditsMuted,
                      ),
                    ),
                    Text(
                      '$balance',
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w800,
                        fontSize: 32,
                        height: 1.1,
                        color: kCreditsInk,
                      ),
                    ),
                    const Text(
                      'créditos disponíveis',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 12,
                        color: kCreditsMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.monetization_on_outlined, color: kCreditsAccent, size: 42),
            ],
          ),
          if (onHistory != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onHistory,
                child: const Text('Últimas compras'),
              ),
            ),
        ],
      ),
    );
  }
}
