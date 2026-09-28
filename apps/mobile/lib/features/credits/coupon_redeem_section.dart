import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'credits_ui.dart';

class CouponRedeemSection extends StatefulWidget {
  const CouponRedeemSection({super.key, required this.onRedeem});

  /// Returns the number of credits granted. Throws [CouponRedeemException] on failure.
  final Future<int> Function(String code) onRedeem;

  @override
  State<CouponRedeemSection> createState() => _CouponRedeemSectionState();
}

class CouponRedeemException implements Exception {
  CouponRedeemException(this.message);

  final String message;
}

class _CouponRedeemSectionState extends State<CouponRedeemSection> {
  final _code = TextEditingController();
  bool _applying = false;
  String? _message;
  bool _success = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    if (_applying) return;
    final code = _code.text.trim();
    if (code.isEmpty) {
      setState(() {
        _success = false;
        _message = 'Digite o código do cupom.';
      });
      return;
    }
    setState(() {
      _applying = true;
      _message = null;
    });
    try {
      final credits = await widget.onRedeem(code);
      if (!mounted) return;
      setState(() {
        _success = true;
        _message = 'Cupom aplicado! Você recebeu $credits crédito(s).';
        _code.clear();
      });
    } on CouponRedeemException catch (e) {
      if (!mounted) return;
      setState(() {
        _success = false;
        _message = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _success = false;
        _message = 'Não foi possível aplicar o cupom.';
      });
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE4E4EA)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Possui um cupom?',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _code,
            textCapitalization: TextCapitalization.characters,
            enabled: !_applying,
            decoration: InputDecoration(
              hintText: 'Digite seu cupom',
              filled: true,
              fillColor: kCreditsBg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE4E4EA)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE4E4EA)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          CreditsPurpleButton(
            label: 'Aplicar',
            loading: _applying,
            onPressed: _apply,
          ),
          if (_message != null) ...[
            const SizedBox(height: 8),
            Text(
              _message!,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _success ? const Color(0xFF1F8A4C) : const Color(0xFFB42318),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
