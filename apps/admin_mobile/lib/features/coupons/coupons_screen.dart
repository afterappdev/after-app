import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
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
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () async {
                final created = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const CouponFormScreen()),
                );
                if (created == true && context.mounted) {
                  await context.read<CouponsController>().load();
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('Novo cupom'),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(child: _list(controller)),
      ],
    );
  }

  Widget _list(CouponsController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando cupons...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(
        message: controller.error!,
        onRetry: controller.load,
      );
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhum cupom',
        message: 'Crie um cupom para conceder créditos bônus.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels >
            notification.metrics.maxScrollExtent - 240) {
          controller.load(refresh: false);
        }
        return false;
      },
      child: RefreshIndicator(
        onRefresh: () => controller.load(),
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          itemCount: controller.items.length + (controller.loadingMore ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            if (index >= controller.items.length) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            final coupon = controller.items[index];
            return AdminCard(
              padding: EdgeInsets.zero,
              child: Material(
                type: MaterialType.transparency,
                child: ListTile(
                title: Text(
                  '${coupon.code} · ${coupon.creditAmount} crédito(s)',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${coupon.statusLabel}\n${_usage(coupon)}\n${_window(coupon)}',
                ),
                isThreeLine: true,
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => CouponDetailScreen(id: coupon.id),
                    ),
                  );
                  if (context.mounted) {
                    await context.read<CouponsController>().load();
                  }
                },
              ),
              ),
            );
          },
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
