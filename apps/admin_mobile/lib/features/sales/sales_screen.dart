import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
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
    return AdminScrollPage(
      title: 'Vendas',
      subtitle: 'Créditos vendidos e histórico de pagamentos',
      onRefresh: () => controller.load(),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 720;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (controller.loadingMetrics)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                )
              else if (controller.monthMetrics != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: _MetricsPanel(wide: wide, metrics: controller.monthMetrics!),
                ),
              if (controller.monthMetrics == null && !controller.loadingMetrics)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: AdminUnavailablePanel(
                    title: 'Resumo do mês',
                    message:
                        'Selecione “Este mês” e limpe filtros de origem/status para ver totais consolidados.',
                  ),
                ),
              const SizedBox(height: 12),
              AdminFilterChipRow(
                children: [
                  AdminFilterChip(
                    label: 'Todos',
                    selected: controller.provider == null,
                    onTap: () => controller.setProvider(null),
                  ),
                  AdminFilterChip(
                    label: 'Google Play',
                    selected: controller.provider == 'google_play',
                    onTap: () => controller.setProvider('google_play'),
                  ),
                  AdminFilterChip(
                    label: 'Apple',
                    selected: controller.provider == 'app_store',
                    onTap: () => controller.setProvider('app_store'),
                  ),
                  AdminFilterChip(
                    label: 'PIX',
                    selected: controller.provider == 'pix',
                    onTap: () => controller.setProvider('pix'),
                  ),
                  AdminFilterChip(
                    key: const Key('sales-provider-card'),
                    label: 'Cartão de crédito',
                    selected: controller.provider == 'card',
                    onTap: () => controller.setProvider('card'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              AdminFilterChipRow(
                children: [
                  AdminFilterChip(
                    label: 'Tudo',
                    selected: controller.period == 'all',
                    onTap: () => controller.setPeriod('all'),
                  ),
                  AdminFilterChip(
                    label: 'Este mês',
                    selected: controller.period == 'month',
                    onTap: () => controller.setPeriod('month'),
                  ),
                  AdminFilterChip(
                    label: '30 dias',
                    selected: controller.period == '30d',
                    onTap: () => controller.setPeriod('30d'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              AdminFilterChipRow(
                children: [
                  AdminFilterChip(
                    label: 'Todas',
                    selected: controller.status == null,
                    onTap: () => controller.setStatus(null),
                  ),
                  AdminFilterChip(
                    key: const Key('sales-status-paid'),
                    label: 'Pagas',
                    selected: controller.status == 'paid',
                    onTap: () => controller.setStatus('paid'),
                  ),
                  AdminFilterChip(
                    key: const Key('sales-status-refunded'),
                    label: 'Reembolsadas',
                    selected: controller.status == 'refunded',
                    onTap: () => controller.setStatus('refunded'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Histórico de vendas',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AdminTheme.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              _list(controller),
            ],
          );
        },
      ),
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
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
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
                      trailing: const Icon(Icons.chevron_right, color: AdminTheme.textSecondary),
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

class _MetricsPanel extends StatelessWidget {
  const _MetricsPanel({required this.wide, required this.metrics});

  final bool wide;
  final SalesMonthMetrics metrics;

  @override
  Widget build(BuildContext context) {
    final providers = [
      (Icons.shop_outlined, 'Google Play', metrics.revenue.googlePlay, AdminTheme.green),
      (Icons.apple, 'App Store', metrics.revenue.appStore, AdminTheme.purple),
      (Icons.qr_code_2_outlined, 'PIX', metrics.revenue.pix, AdminTheme.green),
      (Icons.credit_card_outlined, 'Cartão', metrics.revenue.card, AdminTheme.purple),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Resumo · ${metrics.yearMonth}',
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
            color: AdminTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 10),
        if (wide)
          Row(
            children: [
              Expanded(
                child: AdminKpiCard(
                  label: 'Créditos vendidos',
                  value: formatCount(metrics.creditsSold),
                  icon: Icons.stars_rounded,
                  tint: AdminTheme.orange,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: AdminKpiCard(
                  label: 'Compras pagas',
                  value: formatCount(metrics.paidPurchases),
                  icon: Icons.receipt_long_outlined,
                  tint: AdminTheme.purple,
                ),
              ),
            ],
          )
        else ...[
          AdminKpiCard(
            label: 'Créditos vendidos',
            value: formatCount(metrics.creditsSold),
            icon: Icons.stars_rounded,
            tint: AdminTheme.orange,
          ),
          const SizedBox(height: 10),
          AdminKpiCard(
            label: 'Compras pagas',
            value: formatCount(metrics.paidPurchases),
            icon: Icons.receipt_long_outlined,
            tint: AdminTheme.purple,
          ),
        ],
        const SizedBox(height: 10),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Receita por modalidade (mês atual)',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
              ),
              const SizedBox(height: 10),
              for (final row in providers)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Icon(row.$1, size: 20, color: row.$4),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          row.$2,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text(
                        formatBrl(row.$3),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        if (wide)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _CreditKindCard(metrics: metrics)),
              const SizedBox(width: 10),
              Expanded(child: _PackageCard(metrics: metrics)),
            ],
          )
        else ...[
          _CreditKindCard(metrics: metrics),
          const SizedBox(height: 10),
          _PackageCard(metrics: metrics),
        ],
      ],
    );
  }
}

class _CreditKindCard extends StatelessWidget {
  const _CreditKindCard({required this.metrics});

  final SalesMonthMetrics metrics;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Créditos por tipo',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(height: 10),
          _metricRow('Comuns', formatCount(metrics.commonCredits), AdminTheme.orange),
          _metricRow('VIP', formatCount(metrics.vipCredits), AdminTheme.pink),
        ],
      ),
    );
  }

  Widget _metricRow(String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard({required this.metrics});

  final SalesMonthMetrics metrics;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Pacotes comuns (compras pagas)',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(height: 10),
          _metricRow('1 crédito', formatCount(metrics.purchasesUnit1)),
          _metricRow('5 créditos', formatCount(metrics.purchasesCombo5)),
          _metricRow('10 créditos', formatCount(metrics.purchasesCombo10)),
        ],
      ),
    );
  }

  Widget _metricRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
