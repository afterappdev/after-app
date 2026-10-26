import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../core/theme/app_theme.dart';
import 'vip_push_timing.dart';

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

/// VIP can be bought only when checkout for the current channel is ready (not
/// merely listed in the catalog).
bool vipPackageCheckoutAvailable({
  required Map<String, dynamic> vipOffer,
  required bool vipCheckoutReady,
  required bool usePixCheckout,
}) {
  if (!isDisplayableVipOffer(vipOffer) || asInt(vipOffer['credits']) != 1) {
    return false;
  }
  if (usePixCheckout) {
    return vipCheckoutReady && vipWebCheckoutPack(vipOffer) != null;
  }
  // Native IAP: VIP checkout is not enabled; common packages use the store.
  return false;
}

/// Default package on buy screen: VIP when purchasable, else 1 common credit.
String? preferredInitialBuyCreditsKey({
  Map<String, dynamic>? vipOffer,
  required List<Map<String, dynamic>> commonPackages,
  required bool vipCheckoutReady,
  required bool usePixCheckout,
}) {
  if (vipOffer != null &&
      vipPackageCheckoutAvailable(
        vipOffer: vipOffer,
        vipCheckoutReady: vipCheckoutReady,
        usePixCheckout: usePixCheckout,
      )) {
    final key = vipOffer['key']?.toString();
    if (key != null && key.isNotEmpty) return key;
  }
  for (final item in commonPackages) {
    if (asInt(item['credits']) == 1) return item['key']?.toString();
  }
  return null;
}

int commonCreditPackageSortOrder(Map<String, dynamic> pack) {
  switch (asInt(pack['credits'])) {
    case 1:
      return 0;
    case 5:
      return 1;
    case 10:
      return 2;
    default:
      return 100 + asInt(pack['credits']);
  }
}

List<Map<String, dynamic>> sortCommonCreditPackages(
  Iterable<Map<String, dynamic>> packages,
) {
  final sorted = packages.map(Map<String, dynamic>.from).toList()
    ..sort((a, b) {
      final order = commonCreditPackageSortOrder(a)
          .compareTo(commonCreditPackageSortOrder(b));
      if (order != 0) return order;
      return (a['key']?.toString() ?? '')
          .compareTo(b['key']?.toString() ?? '');
    });
  return sorted;
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

const _pubOrange = AppTheme.accentOrange;
const _pubPurple = AppTheme.accentPurple;
const _pubLilac = Color(0xFFEDE4FB);
const _pubDivider = Color(0xFFE6E6EA);

/// Wallet debit plan for a new publication day (all selected dates share one plan).
enum PublicationBillingPlan { common, vip }

/// COMUM vs VIP selector on Nova publicação.
class PublicationPlanSelector extends StatelessWidget {
  const PublicationPlanSelector({
    super.key,
    required this.plan,
    required this.onPlanChanged,
    required this.commonBalance,
    required this.vipBalance,
  });

  final PublicationBillingPlan plan;
  final ValueChanged<PublicationBillingPlan> onPlanChanged;
  final int commonBalance;
  final int vipBalance;

  @override
  Widget build(BuildContext context) {
    final commonTile = _PublicationPlanTile(
      key: const Key('pub-plan-common'),
      selected: plan == PublicationBillingPlan.common,
      title: 'Comum',
      subtitle: '1 crédito comum por dia',
      balanceLabel: 'Saldo comum',
      balance: commonBalance,
      accent: _pubOrange,
      softFill: kCreditsSoft,
      icon: Icon(Icons.star_rounded, size: 18, color: _pubOrange),
      onTap: () => onPlanChanged(PublicationBillingPlan.common),
    );
    final vipTile = _PublicationPlanTile(
      key: const Key('pub-plan-vip'),
      selected: plan == PublicationBillingPlan.vip,
      title: 'VIP',
      subtitle: 'Destaque na Home + aviso push na cidade',
      balanceLabel: 'Saldo VIP',
      balance: vipBalance,
      accent: _pubPurple,
      softFill: _pubLilac,
      icon: FaIcon(FontAwesomeIcons.crown, size: 14, color: _pubPurple),
      onTap: () => onPlanChanged(PublicationBillingPlan.vip),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 300) {
          return Column(
            children: [
              commonTile,
              const SizedBox(height: 10),
              vipTile,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: commonTile),
            const SizedBox(width: 10),
            Expanded(child: vipTile),
          ],
        );
      },
    );
  }
}

class _PublicationPlanTile extends StatelessWidget {
  const _PublicationPlanTile({
    super.key,
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.balanceLabel,
    required this.balance,
    required this.accent,
    required this.softFill,
    required this.icon,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final String balanceLabel;
  final int balance;
  final Color accent;
  final Color softFill;
  final Widget icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? softFill : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? accent : const Color(0xFFE4E4EA),
          width: selected ? 1.6 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  icon,
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title,
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        color: selected ? accent : kCreditsInk,
                      ),
                    ),
                  ),
                  if (selected)
                    Icon(Icons.check_circle_rounded, size: 18, color: accent),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 11,
                  height: 1.35,
                  color: kCreditsMuted,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '$balanceLabel: $balance',
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Horário do aviso push para publicação VIP (America/Sao_Paulo).
class VipPushTimingSelector extends StatelessWidget {
  const VipPushTimingSelector({
    super.key,
    required this.dateLabels,
    required this.selected,
    required this.onSelected,
    required this.now,
  });

  final List<String> dateLabels;
  final VipPushTiming? selected;
  final ValueChanged<VipPushTiming> onSelected;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final options = allowedVipPushTimingsForAllDateLabels(dateLabels, now);
    if (dateLabels.isEmpty) return const SizedBox.shrink();

    if (options.isEmpty) {
      return Container(
        key: const Key('vip-push-timing-empty'),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF4F4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE8B4B4)),
        ),
        child: const Text(
          'As datas selecionadas não permitem o mesmo horário de aviso push. '
          'Ajuste as datas ou publique em etapas separadas.',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 12,
            height: 1.35,
            color: kCreditsInk,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Horário do aviso push',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w700,
            fontSize: 14,
            color: kCreditsInk,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Fuso: America/Sao_Paulo. O envio imediato agenda o processamento agora; '
          'a entrega pelo celular pode levar alguns minutos.',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 11,
            height: 1.35,
            color: kCreditsMuted,
          ),
        ),
        const SizedBox(height: 10),
        ...options.map((timing) {
          final isSelected = selected == timing;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              key: Key('vip-push-${vipPushTimingApiValue(timing)}'),
              color: isSelected ? _pubLilac : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: isSelected ? _pubPurple : const Color(0xFFE4E4EA),
                  width: isSelected ? 1.6 : 1,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onSelected(timing),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                  child: Row(
                    children: [
                      Icon(
                        isSelected
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                        size: 20,
                        color: isSelected ? _pubPurple : kCreditsMuted,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          labelVipPushTiming(timing),
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                            fontSize: 13,
                            color: kCreditsInk,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }),
        if (selected != null && dateLabels.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            vipPushScheduleSummary(displayDates: dateLabels, timing: selected!),
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: _pubPurple,
            ),
          ),
        ],
      ],
    );
  }
}

/// Compact wallet indicator for Nova publicação (common + VIP, no sum).
class PublicationWalletBadge extends StatelessWidget {
  const PublicationWalletBadge({
    super.key,
    required this.commonBalance,
    required this.vipBalance,
    required this.onBuy,
  });

  final int commonBalance;
  final int vipBalance;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final compact =
        media.size.width < 360 || media.textScaler.scale(10) > 13.5;

    return Material(
      key: const Key('publication-wallet-badge'),
      color: kCreditsSoft,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicWidth(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                compact ? 8 : 9,
                compact ? 5 : 6,
                compact ? 8 : 9,
                compact ? 4 : 5,
              ),
              child: IntrinsicHeight(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _PublicationBalanceChip(
                      valueKey: const Key('pub-badge-common'),
                      icon: Icon(
                        Icons.star_rounded,
                        size: compact ? 12 : 14,
                        color: _pubOrange,
                      ),
                      iconBg: kCreditsSoft,
                      label: 'Comum',
                      value: commonBalance,
                      valueColor: _pubOrange,
                      compact: compact,
                    ),
                    Container(
                      width: 1,
                      margin: EdgeInsets.symmetric(
                        horizontal: compact ? 5 : 6,
                      ),
                      color: _pubDivider,
                    ),
                    _PublicationBalanceChip(
                      valueKey: const Key('pub-badge-vip'),
                      icon: FaIcon(
                        FontAwesomeIcons.crown,
                        size: compact ? 9 : 10,
                        color: _pubPurple,
                      ),
                      iconBg: _pubLilac,
                      label: 'VIP',
                      value: vipBalance,
                      valueColor: _pubPurple,
                      compact: compact,
                    ),
                  ],
                ),
              ),
            ),
            const Divider(
              height: 1,
              thickness: 1,
              color: _pubDivider,
            ),
            Material(
              color: Colors.transparent,
              child: InkWell(
                key: const Key('pub-badge-buy'),
                onTap: onBuy,
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    vertical: compact ? 5 : 6,
                    horizontal: compact ? 8 : 9,
                  ),
                  child: Center(
                    child: Text(
                      'Comprar créditos',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: compact ? 9 : 10,
                        fontWeight: FontWeight.w700,
                        color: _pubOrange,
                        height: 1.1,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PublicationBalanceChip extends StatelessWidget {
  const _PublicationBalanceChip({
    required this.valueKey,
    required this.icon,
    required this.iconBg,
    required this.label,
    required this.value,
    required this.valueColor,
    this.compact = false,
  });

  final Key valueKey;
  final Widget icon;
  final Color iconBg;
  final String label;
  final int value;
  final Color valueColor;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: compact ? 10 : 12,
          backgroundColor: iconBg,
          child: icon,
        ),
        SizedBox(width: compact ? 3 : 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: compact ? 8 : 9,
                fontWeight: FontWeight.w600,
                color: kCreditsMuted,
                height: 1.1,
              ),
            ),
            Text(
              '$value',
              key: valueKey,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: compact ? 13 : 15,
                height: 1.05,
                color: valueColor,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
