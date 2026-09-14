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
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              const Text(
                'Contas',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  color: AdminTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 14),
              _MetricGrid(data: data, wide: wide),
              const SizedBox(height: 16),
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
      (
        'Total',
        formatCount(data.totals.accounts),
        Icons.people_alt_rounded,
        AdminTheme.orange,
      ),
      (
        'Usuários',
        formatCount(data.totals.users),
        Icons.person_rounded,
        AdminTheme.pink,
      ),
      (
        'Locais',
        formatCount(data.totals.venues),
        Icons.storefront_rounded,
        AdminTheme.orange,
      ),
      (
        'Novas no mês',
        formatCount(data.month.newAccounts),
        Icons.trending_up_rounded,
        AdminTheme.green,
      ),
    ];
    final fourAcross = wide || MediaQuery.sizeOf(context).width >= 340;
    final cards = [
      for (final item in items)
        _MetricCard(
          label: item.$1,
          value: item.$2,
          icon: item.$3,
          color: item.$4,
        ),
    ];

    if (fourAcross) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < cards.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: cards[i]),
          ],
        ],
      );
    }

    return Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: cards[0]),
            const SizedBox(width: 8),
            Expanded(child: cards[1]),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: cards[2]),
            const SizedBox(width: 8),
            Expanded(child: cards[3]),
          ],
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(6, 16, 6, 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AdminTheme.textSecondary,
              fontWeight: FontWeight.w600,
              fontSize: 12,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AdminTheme.textPrimary,
                height: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RevenueCard extends StatelessWidget {
  const _RevenueCard({required this.month});

  final AdminDashboardMonth month;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 148),
        decoration: const BoxDecoration(color: AdminTheme.orange),
        child: Stack(
          children: [
            const Positioned.fill(child: CustomPaint(painter: _SparklinePainter())),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
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
                    '${formatCount(month.paidPurchases)} compras  •  ${formatCount(month.creditsSold)} créditos vendidos',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w500,
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

class _SparklinePainter extends CustomPainter {
  const _SparklinePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.28)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * 0.38, size.height * 0.78)
      ..cubicTo(
        size.width * 0.52,
        size.height * 0.86,
        size.width * 0.58,
        size.height * 0.46,
        size.width * 0.70,
        size.height * 0.50,
      )
      ..cubicTo(
        size.width * 0.82,
        size.height * 0.54,
        size.width * 0.88,
        size.height * 0.22,
        size.width * 1.02,
        size.height * 0.18,
      );
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: AdminTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          _row('Google Play', revenue.googlePlay, AdminTheme.purple),
          _row('Apple', revenue.appStore, AdminTheme.pink),
          _row('PIX', revenue.pix, AdminTheme.green),
        ],
      ),
    );
  }

  Widget _row(String label, double value, Color dot) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AdminTheme.textPrimary,
              ),
            ),
          ),
          Text(
            formatBrl(value),
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: AdminTheme.textPrimary,
            ),
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
