import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

const kCreditsAccent = AppTheme.brand;
const kCreditsBg = AppTheme.canvas;
const kCreditsMuted = AppTheme.muted;
const kCreditsInk = AppTheme.ink;
const kCreditsCard = Colors.white;
const kCreditsSoft = AppTheme.sageSoft;

String formatBrl(num value) {
  final cents = (value * 100).round();
  final reais = cents ~/ 100;
  final resto = (cents % 100).toString().padLeft(2, '0');
  final grouped = reais.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+$)'),
        (m) => '${m[1]}.',
      );
  return 'R\$ $grouped,$resto';
}

double asMoney(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int asInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

String packageSubtitle(int credits) {
  switch (credits) {
    case 1:
      return 'Ideal para testar';
    case 5:
      return 'Mais popular';
    case 10:
      return 'Melhor custo-benefício';
    default:
      return 'Pacote de créditos';
  }
}

/// Official reference offer. Mirrors `VIP_CREDIT_PACKAGES` in
/// `apps/api/src/credits/vip-catalog.ts`. Display only: it is not a
/// checkout body and it does not grant credit.
const officialVipReferenceOffer = <String, dynamic>{
  'key': 'vip_unit_1',
  'modality': 'VIP',
  'credits': 1,
  'referencePriceBrl': 99.9,
  'currency': 'BRL',
  'storeProductId': 'after.credits.vip.1',
  'storePriceBrl': null,
};

const vipCatalogUnavailableMessage =
    'Não foi possível carregar o pacote VIP. '
    'Nenhum pagamento foi iniciado e nenhum crédito foi adicionado.';

Map<String, dynamic> copyOfficialVipReferenceOffer() =>
    Map<String, dynamic>.from(officialVipReferenceOffer);

bool isDisplayableVipOffer(Map<dynamic, dynamic> record) {
  if (!isVipCreditRecord(record)) return false;
  if (asInt(record['credits']) != 1) return false;
  if ((record['key']?.toString() ?? '').isEmpty) return false;
  final store = record['storePriceBrl'];
  if (store is num && store > 0) return true;
  final reference = record['referencePriceBrl'];
  return reference is num && reference > 0;
}

const vipWebPriceBrl = 99.9;

Map<String, dynamic>? vipWebCheckoutPack(Map<dynamic, dynamic> record) {
  if (!isDisplayableVipOffer(record)) return null;
  if (record['key']?.toString() != 'vip_unit_1') return null;
  if (asInt(record['credits']) != 1) return null;
  final product = record['storeProductId']?.toString() ??
      record['productId']?.toString() ??
      '';
  if (product != 'after.credits.vip.1') return null;
  final store = record['storePriceBrl'];
  final reference = record['referencePriceBrl'];
  final price = store is num && store > 0
      ? store.toDouble()
      : reference is num
          ? reference.toDouble()
          : null;
  if (price == null || (price - vipWebPriceBrl).abs() > 0.001) return null;
  return {
    ...Map<String, dynamic>.from(record),
    'priceBrl': price,
    'productId': 'after.credits.vip.1',
    'storeProductId': 'after.credits.vip.1',
  };
}

Map<String, dynamic>? firstDisplayableVipOffer(dynamic body) {
  if (body is! List) return null;
  for (final item in body) {
    if (item is! Map) continue;
    final map = Map<String, dynamic>.from(item);
    if (isDisplayableVipOffer(map)) return map;
  }
  return null;
}

bool isVipCreditRecord(Map<dynamic, dynamic> record) {
  final modality = record['modality']?.toString().toUpperCase() ?? '';
  if (modality == 'VIP') return true;
  for (final field in ['key', 'packageKey']) {
    final value = record[field]?.toString() ?? '';
    if (value.startsWith('vip_')) return true;
  }
  for (final field in ['storeProductId', 'productId']) {
    final value = record[field]?.toString() ?? '';
    if (value.contains('.vip.')) return true;
  }
  return false;
}

double? packageSavings(Map<String, dynamic> pack, List<dynamic> packages) {
  final credits = asInt(pack['credits']);
  if (credits <= 1) return null;
  Map<String, dynamic>? unit;
  for (final item in packages) {
    final map = item as Map<String, dynamic>;
    if (asInt(map['credits']) != 1 || isVipCreditRecord(map)) continue;
    if (map['priceBrl'] == null) continue;
    unit = map;
    break;
  }
  if (unit == null) return null;
  final save = asMoney(unit['priceBrl']) * credits - asMoney(pack['priceBrl']);
  return save >= 0.5 ? save : null;
}

String formatPurchaseDate(dynamic value) {
  final parsed = DateTime.tryParse(value?.toString() ?? '');
  if (parsed == null) return '';
  final d = parsed.toLocal();
  final day = d.day.toString().padLeft(2, '0');
  final month = d.month.toString().padLeft(2, '0');
  final hour = d.hour.toString().padLeft(2, '0');
  final minute = d.minute.toString().padLeft(2, '0');
  return '$day/$month/${d.year} • $hour:$minute';
}

const kMonthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

class CreditsPurpleButton extends StatelessWidget {
  const CreditsPurpleButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.subtitle,
    this.icon,
    this.loading = false,
  });

  final String label;
  final String? subtitle;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: subtitle == null ? 52 : 62,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: kCreditsAccent,
          disabledBackgroundColor: kCreditsAccent.withValues(alpha: 0.5),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: Colors.white),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          label,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: Colors.white,
                          ),
                        ),
                        if (subtitle != null)
                          Text(
                            subtitle!,
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w500,
                              fontSize: 12,
                              color: Colors.white,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class CreditsField extends StatelessWidget {
  const CreditsField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.maxLength,
    this.maxLines = 1,
    this.prefixIcon,
    this.suffixIcon,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final int? maxLength;
  final int maxLines;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Color(0xFF4A4A52),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          maxLength: maxLength,
          maxLines: maxLines,
          minLines: maxLines > 1 ? 3 : 1,
          onChanged: onChanged,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: kCreditsInk,
          ),
          decoration: InputDecoration(
            hintText: hint,
            counterText: maxLines > 1 ? null : '',
            prefixIcon: prefixIcon,
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE4E4EA)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: kCreditsAccent, width: 1.4),
            ),
          ),
        ),
      ],
    );
  }
}

class DashedRoundedBorder extends StatelessWidget {
  const DashedRoundedBorder({
    super.key,
    required this.child,
    this.color = kCreditsAccent,
    this.radius = 16,
  });

  final Widget child;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedPainter(color: color, radius: radius),
      child: child,
    );
  }
}

class _DashedPainter extends CustomPainter {
  _DashedPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    const dash = 7.0;
    const gap = 5.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + dash).clamp(0, metric.length).toDouble();
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
