import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_dashboard.dart';
import '../accounts/account_detail_screen.dart';
import '../sales/sale_detail_screen.dart';
import 'dashboard_controller.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<DashboardController>();
    if (controller.loading && controller.data == null) {
      return const StatusBody.loading(message: 'Carregando o painel...');
    }
    if (controller.error != null && controller.data == null) {
      return StatusBody.error(
        message: controller.error!,
        onRetry: controller.load,
      );
    }
    final data = controller.data;
    if (data == null) {
      return const StatusBody.loading();
    }
    return RefreshIndicator(
      onRefresh: () => controller.load(silent: true),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 720;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              const Text(
                'Contas',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
              ),
              const SizedBox(height: 12),
              _MetricGrid(data: data, wide: wide),
              const SizedBox(height: 20),
              _RevenueCard(month: data.month),
              const SizedBox(height: 16),
              _ProvidersCard(revenue: data.month.revenueByProvider),
              const SizedBox(height: 16),
              _HistoryChart(history: data.history),
              if (data.warnings.isNotEmpty) ...[
                const SizedBox(height: 16),
                _WarningsCard(warnings: data.warnings),
              ],
              const SizedBox(height: 20),
              _RecentAccounts(accounts: data.recentAccounts),
              const SizedBox(height: 20),
              _RecentSales(sales: data.recentSales),
            ],
          );
        },
      ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.data, required this.wide});

  final AdminDashboard data;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final items = [
      ('Total', formatCount(data.totals.accounts)),
      ('Usuários', formatCount(data.totals.users)),
      ('Locais', formatCount(data.totals.venues)),
      ('Novas no mês', formatCount(data.month.newAccounts)),
    ];
    return GridView.count(
      crossAxisCount: wide ? 4 : 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: wide ? 1.5 : 1.55,
      children: [
        for (final item in items)
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.$1,
                  style: const TextStyle(
                    color: AdminTheme.muted,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                Text(
                  item.$2,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AdminTheme.ink,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _RevenueCard extends StatelessWidget {
  const _RevenueCard({required this.month});

  final AdminDashboardMonth month;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [Color(0xFFF58634), Color(0xFFE46A1C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Faturamento bruto',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatBrl(month.grossRevenueBrl),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.w800,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '${formatCount(month.paidPurchases)} compras  ·  ${formatCount(month.creditsSold)} créditos vendidos',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.92)),
          ),
        ],
      ),
    );
  }
}

class _ProvidersCard extends StatelessWidget {
  const _ProvidersCard({required this.revenue});

  final ProviderRevenue revenue;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Por origem',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 12),
          _row('Google Play', revenue.googlePlay),
          _row('Apple', revenue.appStore),
          _row('PIX', revenue.pix),
        ],
      ),
    );
  }

  Widget _row(String label, double value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            formatBrl(value),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _HistoryChart extends StatelessWidget {
  const _HistoryChart({required this.history});

  final List<MonthlySales> history;

  @override
  Widget build(BuildContext context) {
    final maxY = history.fold<double>(
      0,
      (current, row) =>
          row.grossRevenueBrl > current ? row.grossRevenueBrl : current,
    );
    final chartMax = maxY <= 0 ? 1.0 : maxY * 1.2;
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Últimos 12 meses',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 4),
          const Text(
            'Faturamento bruto mensal',
            style: TextStyle(color: AdminTheme.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 220,
            child: BarChart(
              BarChartData(
                maxY: chartMax,
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      getTitlesWidget: (value, meta) {
                        final index = value.toInt();
                        if (index < 0 || index >= history.length) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            monthAbbrevFromYearMonth(history[index].yearMonth),
                            style: const TextStyle(
                              fontSize: 10,
                              color: AdminTheme.muted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => AdminTheme.ink,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                      final row = history[group.x.toInt()];
                      return BarTooltipItem(
                        '${monthAbbrevFromYearMonth(row.yearMonth)}\n${formatBrl(row.grossRevenueBrl)}',
                        const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      );
                    },
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < history.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: history[i].grossRevenueBrl,
                          width: 10,
                          borderRadius: BorderRadius.circular(4),
                          color: AdminTheme.brand,
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WarningsCard extends StatelessWidget {
  const _WarningsCard({required this.warnings});

  final List<AdminDashboardWarning> warnings;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Text(
        warnings.map((item) => '${item.code}: ${item.count}').join('\n'),
        style: const TextStyle(color: Color(0xFFB54708), height: 1.4),
      ),
    );
  }
}

class _RecentAccounts extends StatelessWidget {
  const _RecentAccounts({required this.accounts});

  final List<RecentAccount> accounts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Últimas contas',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
        ),
        const SizedBox(height: 10),
        if (accounts.isEmpty)
          const AdminCard(
            child: Text(
              'Nenhuma conta recente.',
              style: TextStyle(color: AdminTheme.muted),
            ),
          )
        else
          AdminCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < accounts.length; i++) ...[
                  ListTile(
                    title: Text(
                      accounts[i].displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${accounts[i].email}\n${roleLabel(accounts[i].role)} · ${formatDate(accounts[i].createdAt)}',
                    ),
                    isThreeLine: true,
                    onTap: () async {
                      final deleted = await Navigator.of(context).push<bool>(
                        MaterialPageRoute(
                          builder: (_) =>
                              AccountDetailScreen(id: accounts[i].id),
                        ),
                      );
                      if (!context.mounted) return;
                      if (deleted == true) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Conta excluída com sucesso'),
                          ),
                        );
                        context.read<DashboardController>().load(silent: true);
                      }
                    },
                  ),
                  if (i != accounts.length - 1) const Divider(height: 1),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _RecentSales extends StatelessWidget {
  const _RecentSales({required this.sales});

  final List<RecentSale> sales;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Últimas vendas',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
        ),
        const SizedBox(height: 10),
        if (sales.isEmpty)
          const AdminCard(
            child: Text(
              'Nenhuma venda recente.',
              style: TextStyle(color: AdminTheme.muted),
            ),
          )
        else
          AdminCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < sales.length; i++) ...[
                  ListTile(
                    title: Text(
                      '${sales[i].credits} créditos · ${formatBrl(sales[i].amountPaid)}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${providerLabel(sales[i].provider)}\n${sales[i].venueName}\n${formatDateTime(sales[i].confirmedAt)}',
                    ),
                    isThreeLine: true,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => SaleDetailScreen(id: sales[i].id),
                      ),
                    ),
                  ),
                  if (i != sales.length - 1) const Divider(height: 1),
                ],
              ],
            ),
          ),
      ],
    );
  }
}
