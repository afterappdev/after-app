import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'credits_ui.dart';

class PurchaseDiscountCouponSection extends StatefulWidget {
  const PurchaseDiscountCouponSection({
    super.key,
    required this.packageKey,
    required this.listPriceBrl,
    required this.onPricingChanged,
  });

  final String packageKey;
  final double listPriceBrl;
  final void Function(PurchaseDiscountPricing pricing) onPricingChanged;

  @override
  State<PurchaseDiscountCouponSection> createState() =>
      _PurchaseDiscountCouponSectionState();
}

class PurchaseDiscountPricing {
  const PurchaseDiscountPricing({
    required this.appliedCode,
    required this.amountPaidBrl,
    required this.discountAmountBrl,
  });

  final String? appliedCode;
  final double amountPaidBrl;
  final double discountAmountBrl;

  static PurchaseDiscountPricing listPrice(double listPriceBrl) {
    return PurchaseDiscountPricing(
      appliedCode: null,
      amountPaidBrl: listPriceBrl,
      discountAmountBrl: 0,
    );
  }
}

class PurchaseCouponException implements Exception {
  PurchaseCouponException(this.message);
  final String message;
}

class _PurchaseDiscountCouponSectionState
    extends State<PurchaseDiscountCouponSection> {
  final _code = TextEditingController();
  bool _loading = false;
  String? _message;
  bool _error = false;

  @override
  void didUpdateWidget(covariant PurchaseDiscountCouponSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.listPriceBrl != widget.listPriceBrl ||
        oldWidget.packageKey != widget.packageKey) {
      widget.onPricingChanged(PurchaseDiscountPricing.listPrice(widget.listPriceBrl));
      setState(() {
        _message = null;
        _error = false;
      });
    }
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final raw = _code.text.trim();
    if (raw.isEmpty) {
      widget.onPricingChanged(PurchaseDiscountPricing.listPrice(widget.listPriceBrl));
      setState(() {
        _message = null;
        _error = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _message = null;
      _error = false;
    });
    try {
      final api = context.read<ApiClient>();
      final result = await api.post(
        '/credits/coupons/preview-purchase',
        body: {'code': raw, 'packageKey': widget.packageKey},
      );
      final map = result is Map<String, dynamic>
          ? result
          : Map<String, dynamic>.from(result as Map);
      final pricing = PurchaseDiscountPricing(
        appliedCode: raw,
        amountPaidBrl: asMoney(map['amountPaidBrl']),
        discountAmountBrl: asMoney(map['discountAmountBrl']),
      );
      widget.onPricingChanged(pricing);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = false;
        _message =
            'Cupom aplicado. Você paga ${formatBrl(pricing.amountPaidBrl)}.';
      });
    } on ApiException catch (e) {
      widget.onPricingChanged(PurchaseDiscountPricing.listPrice(widget.listPriceBrl));
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
        _message = e.message;
      });
    } catch (_) {
      widget.onPricingChanged(PurchaseDiscountPricing.listPrice(widget.listPriceBrl));
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
        _message = 'Não foi possível validar o cupom.';
      });
    }
  }

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
            'Cupom de desconto',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Válido nesta compra (PIX ou cartão). Não confunda com cupom que dá créditos.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              height: 1.35,
              color: Color(0xFF5A4A86),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    hintText: 'Código do cupom',
                    filled: true,
                    fillColor: const Color(0xFFF6F2FF),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _loading ? null : _apply,
                style: FilledButton.styleFrom(
                  backgroundColor: kCreditsAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Aplicar'),
              ),
            ],
          ),
          if (_message != null) ...[
            const SizedBox(height: 8),
            Text(
              _message!,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                color: _error ? const Color(0xFFB42318) : const Color(0xFF027A48),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
