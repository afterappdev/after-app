import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_sale.dart';
import 'sale_detail_screen.dart';
import 'sales_controller.dart';

class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SalesController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<SalesController>();
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              _chip(
                controller.provider == null,
                'Todos',
                () => controller.setProvider(null),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.provider == 'google_play',
                'Google Play',
                () => controller.setProvider('google_play'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.provider == 'app_store',
                'Apple',
                () => controller.setProvider('app_store'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.provider == 'pix',
                'PIX',
                () => controller.setProvider('pix'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.provider == 'card',
                'Cartão de crédito',
                () => controller.setProvider('card'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _chip(
                controller.period == 'all',
                'Tudo',
                () => controller.setPeriod('all'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.period == 'month',
                'Este mês',
                () => controller.setPeriod('month'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.period == '30d',
                '30 dias',
                () => controller.setPeriod('30d'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _chip(
                controller.status == null,
                'Todas',
                () => controller.setStatus(null),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.status == 'paid',
                'Pagas',
                () => controller.setStatus('paid'),
              ),
              const SizedBox(width: 8),
              _chip(
                controller.status == 'refunded',
                'Reembolsadas',
                () => controller.setStatus('refunded'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(child: _list(controller)),
      ],
    );
  }

  String? _refundMark(AdminSale sale) {
    if (sale.status.toUpperCase() == 'REFUNDED' ||
        sale.hasPartialReview ||
        sale.hasOpenRefundReview) {
      return saleHistoryLabel(
        sale.status,
        partialReview: sale.hasPartialReview,
        refundReview: sale.hasOpenRefundReview,
      );
    }
    return null;
  }

  Widget _chip(bool selected, String label, VoidCallback onTap) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }

  Widget _list(SalesController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando vendas...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(
        message: controller.error!,
        onRetry: controller.load,
      );
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma venda',
        message: 'Não há vendas reais neste filtro.',
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
            final sale = controller.items[index];
            final mark = _refundMark(sale);
            return AdminCard(
              padding: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Material(
                    type: MaterialType.transparency,
                    child: ListTile(
                    title: Text(
                      '${formatBrl(sale.amountPaid)} · ${sale.credits} créditos',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${providerLabel(sale.provider)}\n${sale.venueName}\n${formatDateTime(sale.confirmedAt)}',
                    ),
                    isThreeLine: true,
                    onTap: () => pushAdminPage<void>(
                      context,
                      location: '/vendas/${Uri.encodeComponent(sale.id)}',
                      builder: (_) => SaleDetailScreen(id: sale.id),
                    ),
                    ),
                  ),
                  if (mark != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: AdminTheme.sageSoft,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          child: Text(
                            mark,
                            style: const TextStyle(
                              color: AdminTheme.pink,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
