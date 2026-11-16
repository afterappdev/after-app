import 'package:flutter/material.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_coupon.dart';
import 'coupon_detail_screen.dart';
import 'coupons_controller.dart';

Color couponStatusColor(String status) {
  return switch (status) {
    'Ativo' => AdminTheme.green,
    'Expirado' => AdminTheme.pink,
    _ => AdminTheme.textSecondary,
  };
}

Color couponAccent(AdminCoupon coupon) {
  if (coupon.kind == AdminCouponKind.purchaseDiscount) return AdminTheme.green;
  if (coupon.creditKind == AdminCouponCreditKind.vip) return AdminTheme.purple;
  return AdminTheme.orange;
}

IconData couponIcon(AdminCoupon coupon) {
  if (coupon.kind == AdminCouponKind.purchaseDiscount) {
    return Icons.local_offer_outlined;
  }
  if (coupon.creditKind == AdminCouponCreditKind.vip) {
    return Icons.workspace_premium_outlined;
  }
  return Icons.monetization_on_outlined;
}

String couponTypeLabel(AdminCoupon coupon) {
  if (coupon.kind == AdminCouponKind.purchaseDiscount) return 'Desconto';
  return coupon.creditKind.label;
}

String couponCreditsLabel(AdminCoupon coupon) {
  if (coupon.kind == AdminCouponKind.purchaseDiscount) {
    if (coupon.discountType == AdminPurchaseDiscountType.percent &&
        coupon.discountPercent != null) {
      return '${coupon.discountPercent}% na compra';
    }
    if (coupon.discountAmountBrl != null) {
      return '${formatBrl(coupon.discountAmountBrl!)} na compra';
    }
    return 'Desconto na compra';
  }
  return '${coupon.creditAmount ?? 0} crédito(s)';
}

String couponUsageLabel(AdminCoupon coupon) {
  final limit = coupon.maxRedemptions?.toString() ?? '∞';
  return '${formatCount(coupon.redemptionCount)} de $limit utilizações';
}

String couponValidityLabel(AdminCoupon coupon) {
  if (coupon.startsAt == null && coupon.expiresAt == null) {
    return 'Sem validade';
  }
  if (coupon.startsAt != null && coupon.expiresAt == null) {
    return 'A partir de ${formatDate(coupon.startsAt)}';
  }
  if (coupon.startsAt == null && coupon.expiresAt != null) {
    return 'Até ${formatDate(coupon.expiresAt)}';
  }
  return '${formatDate(coupon.startsAt)} – ${formatDate(coupon.expiresAt)}';
}

Future<void> openCouponDetail(BuildContext context, AdminCoupon coupon) {
  return pushAdminPage<void>(
    context,
    location: '/cupons/${Uri.encodeComponent(coupon.id)}',
    builder: (_) => CouponDetailScreen(id: coupon.id),
  );
}

class CouponsTable extends StatelessWidget {
  const CouponsTable({super.key, required this.coupons});

  final List<AdminCoupon> coupons;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AdminTheme.border)),
            ),
            child: const Row(
              children: [
                Expanded(flex: 2, child: Text('Cupom', style: _hdr)),
                Expanded(child: Text('Tipo', style: _hdr)),
                Expanded(flex: 2, child: Text('Benefício', style: _hdr)),
                Expanded(flex: 2, child: Text('Uso', style: _hdr)),
                Expanded(flex: 2, child: Text('Validade', style: _hdr)),
                Expanded(child: Text('Status', style: _hdr)),
                SizedBox(width: 36),
              ],
            ),
          ),
          for (var i = 0; i < coupons.length; i++) ...[
            _CouponTableRow(coupon: coupons[i]),
            if (i != coupons.length - 1)
              const Divider(height: 1, indent: 14, endIndent: 14),
          ],
        ],
      ),
    );
  }

  static const _hdr = TextStyle(
    fontWeight: FontWeight.w700,
    fontSize: 11,
    color: AdminTheme.textSecondary,
  );
}

class _CouponTableRow extends StatelessWidget {
  const _CouponTableRow({required this.coupon});

  final AdminCoupon coupon;

  @override
  Widget build(BuildContext context) {
    final accent = couponAccent(coupon);
    final status = coupon.statusLabel;
    final statusColor = couponStatusColor(status);

    return InkWell(
      onTap: () => openCouponDetail(context, coupon),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              flex: 2,
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(couponIcon(coupon), color: accent, size: 20),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      coupon.code,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _KindPill(label: couponTypeLabel(coupon), color: accent),
            ),
            Expanded(
              flex: 2,
              child: Text(couponCreditsLabel(coupon), style: const TextStyle(fontSize: 11)),
            ),
            Expanded(
              flex: 2,
              child: Text(couponUsageLabel(coupon), style: const TextStyle(fontSize: 11)),
            ),
            Expanded(
              flex: 2,
              child: Text(
                couponValidityLabel(coupon),
                style: const TextStyle(fontSize: 11),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Expanded(
              child: _StatusPill(label: status, color: statusColor),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.more_horiz, color: AdminTheme.textSecondary, size: 18),
              onPressed: () => openCouponDetail(context, coupon),
            ),
          ],
        ),
      ),
    );
  }
}

class CouponMobileCard extends StatelessWidget {
  const CouponMobileCard({super.key, required this.coupon});

  final AdminCoupon coupon;

  @override
  Widget build(BuildContext context) {
    final accent = couponAccent(coupon);
    final status = coupon.statusLabel;
    final statusColor = couponStatusColor(status);

    return AdminCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
      child: InkWell(
        onTap: () => openCouponDetail(context, coupon),
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(couponIcon(coupon), color: accent),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          coupon.code,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                      ),
                      _StatusPill(label: status, color: statusColor),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      _KindPill(label: couponTypeLabel(coupon), color: accent),
                      Text(
                        couponCreditsLabel(coupon),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(couponUsageLabel(coupon), style: const TextStyle(fontSize: 11, color: AdminTheme.textSecondary)),
                  Text(couponValidityLabel(coupon), style: const TextStyle(fontSize: 11, color: AdminTheme.textSecondary)),
                ],
              ),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.more_vert, size: 20, color: AdminTheme.textSecondary),
              onPressed: () => openCouponDetail(context, coupon),
            ),
          ],
        ),
      ),
    );
  }
}

class _KindPill extends StatelessWidget {
  const _KindPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

class CouponsPaginationBar extends StatelessWidget {
  const CouponsPaginationBar({super.key, required this.controller});

  final CouponsController controller;

  @override
  Widget build(BuildContext context) {
    final total = controller.totalItems;
    final page = controller.page;
    final limit = controller.pageLimit;
    if (total == 0) return const SizedBox.shrink();

    final from = (page - 1) * limit + 1;
    final to = page * limit > total ? total : page * limit;
    final pages = controller.totalPages;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 560;
          final pageButtons = _pageNumbers(page, pages);
          final controls = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _PageIcon(
                icon: Icons.chevron_left,
                enabled: page > 1,
                onTap: () => controller.goToPage(page - 1),
              ),
              for (final n in pageButtons) ...[
                const SizedBox(width: 4),
                _PageChip(
                  label: '$n',
                  selected: n == page,
                  onTap: () => controller.goToPage(n),
                ),
              ],
              const SizedBox(width: 4),
              _PageIcon(
                icon: Icons.chevron_right,
                enabled: page < pages,
                onTap: () => controller.goToPage(page + 1),
              ),
            ],
          );
          final caption = Text(
            'Mostrando $from a $to de ${formatCount(total)} cupons',
            style: const TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
          );
          if (compact) {
            return Column(children: [caption, const SizedBox(height: 8), controls]);
          }
          return Row(children: [Expanded(child: caption), controls]);
        },
      ),
    );
  }

  static List<int> _pageNumbers(int current, int totalPages) {
    if (totalPages <= 5) {
      return [for (var i = 1; i <= totalPages; i++) i];
    }
    var start = current - 2;
    if (start < 1) start = 1;
    var end = start + 4;
    if (end > totalPages) {
      end = totalPages;
      start = end - 4;
      if (start < 1) start = 1;
    }
    return [for (var i = start; i <= end; i++) i];
  }
}

class _PageChip extends StatelessWidget {
  const _PageChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AdminTheme.purple.withValues(alpha: 0.12) : null,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? AdminTheme.purple.withValues(alpha: 0.35) : AdminTheme.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 12,
            color: selected ? AdminTheme.purple : AdminTheme.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _PageIcon extends StatelessWidget {
  const _PageIcon({required this.icon, required this.enabled, required this.onTap});

  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      onPressed: enabled ? onTap : null,
      icon: Icon(icon, size: 20),
    );
  }
}
