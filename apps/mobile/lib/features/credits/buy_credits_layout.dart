import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../core/theme/app_theme.dart';
import 'credits_ui.dart';
import 'purchase_labels.dart';

const buyCreditsPage = Color(0xFFF5F6F8);
const buyCreditsOrange = AppTheme.accentOrange;
const buyCreditsPurple = AppTheme.accentPurple;
const buyCreditsLilac = Color(0xFFF6F0FC);
const buyCreditsLilacIcon = Color(0xFFEDE4FB);
const buyCreditsBorder = Color(0xFFE6E6EA);
const buyCreditsPaidBg = Color(0xFFE6F6EC);
const buyCreditsPaidFg = Color(0xFF22A45A);

({Color background, Color foreground}) purchaseStatusColors(String? status) {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
      return (background: buyCreditsPaidBg, foreground: buyCreditsPaidFg);
    case 'FAILED':
    case 'CANCELLED':
      return (
        background: const Color(0xFFFDECEC),
        foreground: const Color(0xFFB3261E),
      );
    case 'REFUNDED':
      return (
        background: const Color(0xFFE8EEF8),
        foreground: const Color(0xFF3D5A80),
      );
    default:
      return (
        background: const Color(0xFFF0F0F3),
        foreground: kCreditsMuted,
      );
  }
}

class BuyCreditsBalanceCard extends StatelessWidget {
  const BuyCreditsBalanceCard({
    super.key,
    required this.commonBalance,
    required this.vipBalance,
    required this.onHistory,
  });

  final int commonBalance;
  final int vipBalance;
  final VoidCallback onHistory;

  @override
  Widget build(BuildContext context) {
    final scale =
        MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.2).toDouble();
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: _BalanceColumn(
                  icon: const _RoundIcon(
                    background: kCreditsSoft,
                    child: Icon(
                      Icons.star_rounded,
                      color: buyCreditsOrange,
                      size: 20,
                    ),
                  ),
                  label: 'Créditos comuns',
                  valueKey: const Key('balance-common'),
                  value: commonBalance,
                ),
              ),
              Container(
                width: 1,
                height: 72 * scale,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                color: buyCreditsBorder,
              ),
              Expanded(
                child: _BalanceColumn(
                  icon: const _RoundIcon(
                    background: buyCreditsLilacIcon,
                    child: FaIcon(
                      FontAwesomeIcons.crown,
                      color: buyCreditsPurple,
                      size: 14,
                    ),
                  ),
                  label: 'Créditos VIP',
                  valueKey: const Key('balance-vip'),
                  value: vipBalance,
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              key: const Key('balance-history-link'),
              behavior: HitTestBehavior.opaque,
              onTap: onHistory,
              child: const Padding(
                padding: EdgeInsets.fromLTRB(8, 6, 2, 4),
                child: Text(
                  'Últimas compras',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    color: kCreditsInk,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalanceColumn extends StatelessWidget {
  const _BalanceColumn({
    required this.icon,
    required this.label,
    required this.valueKey,
    required this.value,
  });

  final Widget icon;
  final String label;
  final Key valueKey;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        icon,
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 12,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  color: kCreditsMuted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$value',
                key: valueKey,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w800,
                  fontSize: 30,
                  height: 1.05,
                  color: kCreditsInk,
                ),
              ),
              const Text(
                'créditos disponíveis',
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 11,
                  height: 1.25,
                  color: kCreditsMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.background, required this.child});

  final Color background;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: child,
    );
  }
}

class BuyCreditsPackageTile extends StatelessWidget {
  const BuyCreditsPackageTile({
    super.key,
    required this.vip,
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.priceLabel,
    required this.onTap,
    this.unitLabel,
    this.savingsLabel,
  });

  final bool vip;
  final bool selected;
  final String title;
  final String subtitle;
  final String priceLabel;
  final String? unitLabel;
  final String? savingsLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = vip
        ? buyCreditsPurple
        : selected
            ? buyCreditsOrange
            : buyCreditsBorder;
    final priceColor = vip ? buyCreditsPurple : buyCreditsOrange;
    return Material(
      color: vip ? buyCreditsLilac : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: borderColor, width: selected || vip ? 1.6 : 1),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final scale = MediaQuery.textScalerOf(context).scale(1);
              final textBudget = constraints.maxWidth - 78;
              final stackPrice = textBudget < 200 ||
                  (scale >= 1.45 && textBudget < 230);
              final sidePrice = vip && !stackPrice;
              final titleBlock = Wrap(
                spacing: 6,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      height: 1.2,
                      color: kCreditsInk,
                    ),
                  ),
                  if (vip) const _VipBadge(),
                ],
              );
              final price = Text(
                priceLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  height: 1.2,
                  color: priceColor,
                ),
              );
              final header = stackPrice
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        titleBlock,
                        const SizedBox(height: 4),
                        Align(alignment: Alignment.centerRight, child: price),
                      ],
                    )
                  : vip
                      ? titleBlock
                      : Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: titleBlock),
                            const SizedBox(width: 8),
                            price,
                          ],
                        );
              return Row(
                crossAxisAlignment: sidePrice
                    ? CrossAxisAlignment.center
                    : CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: sidePrice ? 0 : 2),
                    child: _SelectMark(
                      selected: selected,
                      color: vip ? buyCreditsPurple : buyCreditsOrange,
                      idleColor:
                          vip ? buyCreditsPurple : const Color(0xFFD0D0D6),
                    ),
                  ),
                  const SizedBox(width: 10),
                  _RoundIcon(
                    background: vip ? buyCreditsLilacIcon : kCreditsSoft,
                    child: vip
                        ? const FaIcon(
                            FontAwesomeIcons.crown,
                            size: 13,
                            color: buyCreditsPurple,
                          )
                        : const Icon(
                            Icons.star_rounded,
                            size: 18,
                            color: buyCreditsOrange,
                          ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        header,
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontSize: 12,
                            height: 1.35,
                            color: kCreditsMuted,
                          ),
                        ),
                        if (unitLabel != null) ...[
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 8,
                            runSpacing: 2,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                unitLabel!,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontSize: 12,
                                  color: kCreditsMuted,
                                ),
                              ),
                              if (savingsLabel != null)
                                Text(
                                  savingsLabel!,
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                    color: buyCreditsOrange,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (sidePrice) ...[
                    const SizedBox(width: 8),
                    price,
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _VipBadge extends StatelessWidget {
  const _VipBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: buyCreditsPurple,
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        'VIP',
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w800,
          fontSize: 10,
          height: 1.1,
          letterSpacing: 0.3,
          color: Colors.white,
        ),
      ),
    );
  }
}

class _SelectMark extends StatelessWidget {
  const _SelectMark({
    required this.selected,
    required this.color,
    required this.idleColor,
  });

  final bool selected;
  final Color color;
  final Color idleColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? color : idleColor,
          width: 2,
        ),
      ),
      child: selected
          ? Center(
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
            )
          : null,
    );
  }
}

class BuyCreditsHistoryTile extends StatelessWidget {
  const BuyCreditsHistoryTile({
    super.key,
    required this.title,
    required this.provider,
    required this.dateLabel,
    required this.amountLabel,
    required this.amountColor,
    required this.status,
  });

  final String title;
  final String provider;
  final String dateLabel;
  final String amountLabel;
  final Color amountColor;
  final String status;

  @override
  Widget build(BuildContext context) {
    final colors = purchaseStatusColors(status);
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        purchaseStatusLabel(status),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: colors.foreground,
        ),
      ),
    );
    final amount = Text(
      amountLabel,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontWeight: FontWeight.w800,
        fontSize: 13,
        color: amountColor,
      ),
    );
    final info = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 14,
            color: kCreditsInk,
          ),
        ),
        if (provider.isNotEmpty)
          Text(
            provider,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              height: 1.3,
              color: kCreditsMuted,
            ),
          ),
        if (dateLabel.isNotEmpty)
          Text(
            dateLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 12,
              height: 1.3,
              color: kCreditsMuted,
            ),
          ),
      ],
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final sideBySide = constraints.maxWidth >= 330;
        final trailing = sideBySide
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  amount,
                  const SizedBox(width: 8),
                  chip,
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  amount,
                  const SizedBox(height: 6),
                  chip,
                ],
              );
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: info),
            const SizedBox(width: 8),
            trailing,
          ],
        );
      },
    );
  }
}

class BuyCreditsPayBar extends StatelessWidget {
  const BuyCreditsPayBar({
    super.key,
    required this.totalLabel,
    required this.onPressed,
  });

  final String? totalLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('buy-credits-continue'),
                onPressed: onPressed,
                style: FilledButton.styleFrom(
                  backgroundColor: buyCreditsOrange,
                  disabledBackgroundColor: buyCreditsOrange.withValues(alpha: 0.45),
                  foregroundColor: Colors.white,
                  disabledForegroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(56),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  tapTargetSize: MaterialTapTargetSize.padded,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Continuar para pagamento',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: Colors.white,
                      ),
                    ),
                    if (totalLabel != null)
                      Text(
                        totalLabel!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: Colors.white,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              children: [
                Icon(Icons.lock_outline, size: 14, color: kCreditsMuted),
                Text(
                  'Pagamento 100% seguro',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 12,
                    color: kCreditsMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class BuyCreditsSectionTitle extends StatelessWidget {
  const BuyCreditsSectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontWeight: FontWeight.w800,
        fontSize: 18,
        color: kCreditsInk,
      ),
    );
  }
}
