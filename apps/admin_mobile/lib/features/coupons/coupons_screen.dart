import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_coupon.dart';
import 'coupon_detail_screen.dart';
import 'coupon_form_screen.dart';
import 'coupons_controller.dart';

class CouponsScreen extends StatefulWidget {
  const CouponsScreen({super.key});

  @override
  State<CouponsScreen> createState() => _CouponsScreenState();
}

class _CouponsScreenState extends State<CouponsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CouponsController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<CouponsController>();
    return AdminScrollPage(
      title: 'Cupons',
      subtitle: 'Gerencie os cupons de créditos',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: FilledButton.icon(
              onPressed: () async {
                final created = await pushAdminPage<bool>(
                  context,
                  location: '/cupons/novo',
                  builder: (_) => const CouponFormScreen(),
                );
                if (created == true && context.mounted) {
                  await context.read<CouponsController>().load();
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('Novo cupom'),
            ),
          ),
          const SizedBox(height: 12),
          AdminFilterChipRow(
            children: [
              AdminFilterChip(
                label: 'Todos',
                selected: controller.filter == 'all',
                onTap: () => controller.setFilter('all'),
              ),
              AdminFilterChip(
                label: 'Ativos',
                selected: controller.filter == 'active',
                onTap: () => controller.setFilter('active'),
              ),
              AdminFilterChip(
                label: 'Inativos',
                selected: controller.filter == 'inactive',
                onTap: () => controller.setFilter('inactive'),
              ),
              AdminFilterChip(
                label: 'Expirados',
                selected: controller.filter == 'expired',
                onTap: () => controller.setFilter('expired'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _list(controller),
        ],
      ),
    );
  }

  Widget _list(CouponsController controller) {
    final items = controller.visibleItems;
    if (controller.loading && items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando cupons...');
    }
    if (controller.error != null && items.isEmpty) {
      return StatusBody.error(message: controller.error!, onRetry: controller.load);
    }
    if (items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhum cupom',
        message: 'Crie um cupom para conceder créditos bônus.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels > notification.metrics.maxScrollExtent - 240) {
          controller.load(refresh: false);
        }
        return false;
      },
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        itemCount: items.length + (controller.loadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index >= items.length) {
            return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
          }
          final coupon = items[index];
          return _CouponCard(
            coupon: coupon,
            onTap: () async {
              await pushAdminPage<void>(
                context,
                location: '/cupons/${Uri.encodeComponent(coupon.id)}',
                builder: (_) => CouponDetailScreen(id: coupon.id),
              );
              if (context.mounted) await context.read<CouponsController>().load();
            },
          );
        },
      ),
    );
  }
}

class _CouponCard extends StatelessWidget {
  const _CouponCard({required this.coupon, required this.onTap});

  final AdminCoupon coupon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final vip = coupon.creditKind == AdminCouponCreditKind.vip;
    final statusColor = switch (coupon.statusLabel) {
      'Ativo' => AdminTheme.green,
      'Expirado' => AdminTheme.pink,
      _ => AdminTheme.textSecondary,
    };
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (vip ? AdminTheme.purple : AdminTheme.orange).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                vip ? Icons.workspace_premium_outlined : Icons.monetization_on_outlined,
                color: vip ? AdminTheme.purple : AdminTheme.orange,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        coupon.code,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          coupon.statusLabel,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${coupon.creditAmount} crédito(s) · ${coupon.creditKind.label}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _usage(coupon),
                    style: const TextStyle(color: AdminTheme.textSecondary, fontSize: 12),
                  ),
                  Text(
                    _window(coupon),
                    style: const TextStyle(color: AdminTheme.textSecondary, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.more_vert, color: AdminTheme.textSecondary),
          ],
        ),
      ),
    );
  }

  String _usage(AdminCoupon coupon) {
    final limit = coupon.maxRedemptions?.toString() ?? 'sem limite';
    return '${coupon.redemptionCount} de $limit utilizações';
  }

  String _window(AdminCoupon coupon) {
    final start = coupon.startsAt == null ? 'já' : formatDate(coupon.startsAt);
    final end = coupon.expiresAt == null ? 'sem validade' : formatDate(coupon.expiresAt);
    return 'De $start até $end';
  }
}
