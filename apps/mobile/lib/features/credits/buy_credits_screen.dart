import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'billing_channel.dart';
import 'buy_credits_layout.dart';
import 'checkout_screen.dart';
import 'coupon_redeem_section.dart';
import 'credits_ui.dart';
import 'pix_pending_reconcile.dart';
import 'purchase_labels.dart';
import 'web_checkout_screen.dart';

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
  final _historyKey = GlobalKey();
  final _scroll = ScrollController();
  bool _loading = true;
  String? _error;
  int _balance = 0;
  int _vipBalance = 0;
  List<dynamic> _packages = [];
  Map<String, dynamic>? _vipPack;
  String? _vipCatalogError;
  bool _vipCheckoutReady = false;
  List<dynamic> _purchases = [];
  String? _selectedKey;
  bool _userPickedPackage = false;

  bool get _reconcilePendingPix =>
      widget.reconcilePendingPix ?? billingUsesPix();

  bool get _usePixCheckout => widget.usePixCheckout ?? billingUsesPix();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
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
      final vip = await _loadVipOffer(api);
      if (!mounted) return;
      final common = sortCommonCreditPackages([
        for (final item in packages)
          if (item is Map && !isVipCreditRecord(item))
            Map<String, dynamic>.from(item),
      ]);
      final known = <String>{
        for (final item in common) item['key']?.toString() ?? '',
        if (vip.offer != null) vip.offer!['key']?.toString() ?? '',
      };
      var selected = _selectedKey;
      if (!_userPickedPackage) {
        selected = preferredInitialBuyCreditsKey(
          vipOffer: vip.offer,
          commonPackages: common,
          vipCheckoutReady: vip.checkoutReady,
          usePixCheckout: _usePixCheckout,
        );
      } else if (selected == null || !known.contains(selected)) {
        selected = preferredInitialBuyCreditsKey(
          vipOffer: vip.offer,
          commonPackages: common,
          vipCheckoutReady: vip.checkoutReady,
          usePixCheckout: _usePixCheckout,
        );
      }
      setState(() {
        _balance = asInt(wallet['balance']);
        _vipBalance = asInt(wallet['vipBalance']);
        _packages = common;
        _vipPack = vip.offer;
        _vipCatalogError = vip.error;
        _vipCheckoutReady = vip.checkoutReady;
        _purchases = purchases;
        _selectedKey = selected;
        _loading = false;
      });
      if (_reconcilePendingPix) {
        await _reconcilePendingPixPurchases();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.statusCode == 401 ? friendlyPixError(e) : e.message;
        _loading = false;
      });
    }
  }

  Future<_VipOfferLoad> _loadVipOffer(ApiClient api) async {
    try {
      final body = await api.get('/credits/vip-packages');
      final offer = firstDisplayableVipOffer(body);
      if (offer == null) {
        return const _VipOfferLoad(error: vipCatalogUnavailableMessage);
      }
      final payable = vipWebCheckoutPack(offer);
      return _VipOfferLoad(offer: offer, checkoutReady: payable != null);
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        return _VipOfferLoad(offer: copyOfficialVipReferenceOffer());
      }
      return const _VipOfferLoad(error: vipCatalogUnavailableMessage);
    } catch (_) {
      return const _VipOfferLoad(error: vipCatalogUnavailableMessage);
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
      _balance = asInt(wallet['balance']);
      _vipBalance = asInt(wallet['vipBalance']);
    });
  }

  Map<String, dynamic>? get _selected {
    if (_vipPack != null && _vipPack!['key']?.toString() == _selectedKey) {
      return _vipPack;
    }
    for (final item in _packages) {
      final map = item as Map<String, dynamic>;
      if (map['key']?.toString() == _selectedKey) return map;
    }
    for (final item in _packages) {
      final map = item as Map<String, dynamic>;
      if (asInt(map['credits']) == 1) return map;
    }
    if (_packages.isEmpty) return null;
    return _packages.first as Map<String, dynamic>;
  }

  Future<int> _redeemCoupon(String code) async {
    final api = context.read<ApiClient>();
    try {
      final body = await api.post('/credits/coupons/redeem', body: {'code': code});
      final map = Map<String, dynamic>.from(body as Map);
      final balance = map['balance'];
      if (balance is num && mounted) {
        setState(() {
          _balance = balance.round();
          if (map['vipBalance'] is num) {
            _vipBalance = (map['vipBalance'] as num).round();
          }
        });
      }
      final credits = map['creditAmount'];
      return credits is num ? credits.round() : 0;
    } on ApiException catch (e) {
      throw CouponRedeemException(e.message);
    }
  }

  String? _offerPriceLabel(Map<String, dynamic> pack) {
    if (!isVipCreditRecord(pack)) return formatBrl(asMoney(pack['priceBrl']));
    final store = pack['storePriceBrl'];
    if (store is num && store > 0) return formatBrl(store.toDouble());
    final reference = pack['referencePriceBrl'];
    if (reference == null) return null;
    return formatBrl(asMoney(reference));
  }

  String? _totalLabel(Map<String, dynamic>? pack) {
    if (pack == null) return null;
    final price = _offerPriceLabel(pack);
    if (price == null) return 'Total indisponível';
    return 'Total: $price';
  }

  String _purchaseTitle(Map<String, dynamic> purchase) {
    final credits = asInt(purchase['credits']);
    if (isVipCreditRecord(purchase)) {
      return credits == 1 ? '1 crédito VIP' : '$credits créditos VIP';
    }
    return credits == 1 ? '1 crédito' : '$credits créditos';
  }

  Future<void> _blockVipCheckout() {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text(
            'Crédito VIP',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: const Text(
            'A compra de créditos VIP ainda não está disponível. '
            'Nenhum pagamento foi iniciado e nenhum crédito VIP foi adicionado.',
            style: TextStyle(fontFamily: AppTheme.fontFamily, height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Entendi'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _continue() async {
    final pack = _selected;
    if (pack == null) return;
    if (isVipCreditRecord(pack)) {
      final payable = _vipCheckoutReady && _usePixCheckout
          ? vipWebCheckoutPack(pack)
          : null;
      if (payable == null) {
        await _blockVipCheckout();
        return;
      }
      final paid = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => WebCheckoutScreen(pack: payable)),
      );
      if (!mounted) return;
      if (paid == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Crédito VIP adicionado à sua carteira.')),
        );
      }
      await _load();
      return;
    }
    final dest = _usePixCheckout
        ? WebCheckoutScreen(pack: pack)
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

  Future<void> _scrollToPurchases() async {
    final visible = _historyKey.currentContext;
    if (visible != null) {
      await Scrollable.ensureVisible(
        visible,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
        alignment: 0.05,
      );
      return;
    }
    if (!_scroll.hasClients) return;
    await _scroll.animateTo(
      _scroll.position.maxScrollExtent,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
    if (!mounted) return;
    final built = _historyKey.currentContext;
    if (built == null || !built.mounted) return;
    await Scrollable.ensureVisible(
      built,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      alignment: 0.05,
    );
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final offers = <Map<String, dynamic>>[
      ?_vipPack,
      for (final item in _packages) item as Map<String, dynamic>,
    ];

    return Scaffold(
      backgroundColor: buyCreditsPage,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
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
              ? const Center(
                  child: CircularProgressIndicator(color: buyCreditsOrange),
                )
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                color: kCreditsInk,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: _load,
                              child: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        Expanded(
                          child: RefreshIndicator(
                            color: buyCreditsOrange,
                            onRefresh: _load,
                            child: ListView(
                              controller: _scroll,
                              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                              children: [
                                BuyCreditsBalanceCard(
                                  commonBalance: _balance,
                                  vipBalance: _vipBalance,
                                  onHistory: _scrollToPurchases,
                                ),
                                const SizedBox(height: 22),
                                const BuyCreditsSectionTitle('Escolha um pacote'),
                                const SizedBox(height: 12),
                                if (_vipCatalogError != null) ...[
                                  Text(
                                    _vipCatalogError!,
                                    key: const Key('vip-catalog-error'),
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 13,
                                      height: 1.35,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                ],
                                for (final pack in offers) ...[
                                  BuyCreditsPackageTile(
                                    key: ValueKey('pack-${pack['key']}'),
                                    vip: isVipCreditRecord(pack),
                                    selected: pack['key']?.toString() == _selectedKey,
                                    title: _offerTitle(pack),
                                    subtitle: _offerSubtitle(pack),
                                    priceLabel: _offerPriceLabel(pack) ?? '—',
                                    unitLabel: _unitLabel(pack),
                                    savingsLabel: _savingsLabel(pack),
                                    onTap: () => setState(() {
                                      _userPickedPackage = true;
                                      _selectedKey = pack['key']?.toString();
                                    }),
                                  ),
                                  const SizedBox(height: 10),
                                ],
                                const SizedBox(height: 12),
                                KeyedSubtree(
                                  key: const Key('purchase-history'),
                                  child: BuyCreditsSectionTitle(
                                    'Últimas compras',
                                    key: _historyKey,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                if (_purchases.isEmpty)
                                  const Text(
                                    'Nenhuma compra ainda.',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 13,
                                      color: kCreditsMuted,
                                    ),
                                  )
                                else
                                  for (final item in _purchases)
                                    if (item is Map)
                                      Padding(
                                        padding: const EdgeInsets.only(bottom: 16),
                                        child: BuyCreditsHistoryTile(
                                          key: ValueKey(
                                            'history-${item['id'] ?? item.hashCode}',
                                          ),
                                          title: _purchaseTitle(
                                            Map<String, dynamic>.from(item),
                                          ),
                                          provider: purchaseProviderLabel(
                                            item['provider']?.toString(),
                                          ),
                                          dateLabel: formatPurchaseDate(
                                            item['createdAt'],
                                          ),
                                          amountLabel: formatBrl(
                                            asMoney(item['amountPaid']),
                                          ),
                                          amountColor: isVipCreditRecord(item)
                                              ? buyCreditsPurple
                                              : buyCreditsOrange,
                                          status: item['status']?.toString() ?? '',
                                        ),
                                      ),
                                if (creditsCouponAvailable()) ...[
                                  const SizedBox(height: 8),
                                  CouponRedeemSection(onRedeem: _redeemCoupon),
                                ],
                              ],
                            ),
                          ),
                        ),
                        BuyCreditsPayBar(
                          totalLabel: _totalLabel(selected),
                          onPressed: selected == null ? null : _continue,
                        ),
                      ],
                    ),
        ),
      ),
    );
  }

  String _offerTitle(Map<String, dynamic> pack) {
    final credits = asInt(pack['credits']);
    if (isVipCreditRecord(pack)) {
      return credits == 1 ? '1 crédito VIP' : '$credits créditos VIP';
    }
    return credits == 1 ? '1 crédito' : '$credits créditos';
  }

  String _offerSubtitle(Map<String, dynamic> pack) {
    if (isVipCreditRecord(pack)) {
      return 'Destaque na página HOME e\nenvio de aviso aos usuários';
    }
    return packageSubtitle(asInt(pack['credits']));
  }

  String? _unitLabel(Map<String, dynamic> pack) {
    if (isVipCreditRecord(pack)) return null;
    final credits = asInt(pack['credits']);
    if (credits <= 0) return null;
    final unit = asMoney(pack['priceBrl']) / credits;
    return '${formatBrl(unit)} por crédito';
  }

  String? _savingsLabel(Map<String, dynamic> pack) {
    if (isVipCreditRecord(pack)) return null;
    final save = packageSavings(pack, _packages);
    if (save == null) return null;
    return 'Economize ${formatBrl(save)}';
  }
}

class _VipOfferLoad {
  const _VipOfferLoad({this.offer, this.error, this.checkoutReady = false});

  final Map<String, dynamic>? offer;
  final String? error;
  final bool checkoutReady;
}
