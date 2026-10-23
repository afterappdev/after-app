import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
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
  String? _selectedYm;

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
    if (data == null) return const StatusBody.loading();

    _selectedYm ??= data.month.yearMonth;
    final monthOptions = {
      data.month.yearMonth,
      for (final row in data.history) row.yearMonth,
    }.toList()
      ..sort();

    final selectedYm = _selectedYm!;
    final monthRevenue = selectedYm == data.month.yearMonth
        ? data.month.grossRevenueBrl
        : data.history
                .where((h) => h.yearMonth == selectedYm)
                .map((h) => h.grossRevenueBrl)
                .cast<double?>()
                .firstOrNull ??
            0.0;

    final reportsLabel = selectedYm == data.month.yearMonth &&
            controller.reportsPendingTotal != null
        ? formatCount(controller.reportsPendingTotal!)
        : '—';

    return AdminScrollPage(
      title: 'Dashboard',
      subtitle: 'Visão geral do After',
      onRefresh: () => controller.load(silent: true),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 720;
          final pad = wide ? 28.0 : 20.0;
          return Padding(
            padding: EdgeInsets.symmetric(horizontal: pad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _MonthFilter(
                  compact: constraints.maxWidth < 420,
                  value: selectedYm,
                  options: monthOptions,
                  onChanged: (v) => setState(() => _selectedYm = v),
                ),
                const SizedBox(height: 16),
                _KpiGrid(
                  wide: wide,
                  newAccounts: selectedYm == data.month.yearMonth
                      ? formatCount(data.month.newAccounts)
                      : '—',
                  salesTotal: formatBrl(monthRevenue),
                  reportsLabel: reportsLabel,
                  reportsSubtitle: reportsLabel == '—'
                      ? 'Sem agregação mensal na API'
                      : 'Pendentes · total no sistema',
                ),
                const SizedBox(height: 16),
                if (wide)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _AccountsDonut(
                          compact: false,
                          users: data.totals.users,
                          venues: data.totals.venues,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _SalesDonut(
                          compact: false,
                          revenue: data.month.revenueByProvider,
                        ),
                      ),
                    ],
                  )
                else ...[
                  _AccountsDonut(
                    compact: constraints.maxWidth < 420,
                    users: data.totals.users,
                    venues: data.totals.venues,
                  ),
                  const SizedBox(height: 12),
                  _SalesDonut(
                    compact: constraints.maxWidth < 420,
                    revenue: data.month.revenueByProvider,
                  ),
                ],
                const SizedBox(height: 16),
                if (wide)
                  const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: AdminUnavailablePanel(title: 'Top 3 cidades')),
                      SizedBox(width: 12),
                      Expanded(child: AdminUnavailablePanel(title: 'Top 3 categorias')),
                    ],
                  )
                else ...[
                  const AdminUnavailablePanel(title: 'Top 3 cidades'),
                  const SizedBox(height: 12),
                  const AdminUnavailablePanel(title: 'Top 3 categorias'),
                ],
                const SizedBox(height: 20),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text(
                    'Detalhes operacionais',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: AdminTheme.textPrimary,
                    ),
                  ),
                  children: [
                    _ProvidersBreakdown(revenue: data.month.revenueByProvider),
                    const SizedBox(height: 12),
                    _RefundSection(position: data.refundPosition),
                    if (data.warnings.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _WarningsCard(warnings: data.warnings),
                    ],
                    const SizedBox(height: 12),
                    _HistoryChart(history: data.history),
                    const SizedBox(height: 16),
                    _RecentAccounts(accounts: data.recentAccounts),
                    const SizedBox(height: 16),
                    _RecentSales(sales: data.recentSales),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MonthFilter extends StatelessWidget {
  const _MonthFilter({
    required this.compact,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final bool compact;
  final String value;
  final List<String> options;
  final ValueChanged<String?> onChanged;

  Widget _dropdown() {
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        isExpanded: compact,
        value: value,
        items: [
          for (final ym in options)
            DropdownMenuItem(
              value: ym,
              child: Text(formatYearMonthLabel(ym)),
            ),
        ],
        onChanged: onChanged,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: compact
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Row(
                  children: [
                    Icon(Icons.calendar_month_outlined, color: AdminTheme.purple, size: 22),
                    SizedBox(width: 10),
                    Text(
                      'Selecionar mês',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: AdminTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
                _dropdown(),
              ],
            )
          : Row(
              children: [
                const Icon(Icons.calendar_month_outlined, color: AdminTheme.purple, size: 22),
                const SizedBox(width: 10),
                const Text(
                  'Selecionar mês',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AdminTheme.textPrimary,
                  ),
                ),
                const Spacer(),
                _dropdown(),
              ],
            ),
    );
  }
}

String formatYearMonthLabel(String ym) {
  final parts = ym.split('-');
  if (parts.length != 2) return ym;
  final month = int.tryParse(parts[1]) ?? 1;
  const names = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  final name = month >= 1 && month <= 12 ? names[month - 1] : parts[1];
  return '$name de ${parts[0]}';
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({
    required this.wide,
    required this.newAccounts,
    required this.salesTotal,
    required this.reportsLabel,
    required this.reportsSubtitle,
  });

  final bool wide;
  final String newAccounts;
  final String salesTotal;
  final String reportsLabel;
  final String reportsSubtitle;

  @override
  Widget build(BuildContext context) {
    final cards = [
      AdminKpiCard(
        label: 'Contas criadas\n(Usuários e Locais)',
        value: newAccounts,
        icon: Icons.groups_outlined,
        tint: AdminTheme.orange,
      ),
      const AdminKpiCard(
        label: 'Downloads\nPlay Store',
        value: '—',
        icon: Icons.shop_outlined,
        tint: AdminTheme.green,
        unavailable: true,
        subtitle: 'Sem fonte no painel',
      ),
      const AdminKpiCard(
        label: 'Downloads\nApp Store',
        value: '—',
        icon: Icons.apple,
        tint: AdminTheme.purple,
        unavailable: true,
        subtitle: 'Sem fonte no painel',
      ),
      const AdminKpiCard(
        label: 'Acessos\nno site',
        value: '—',
        icon: Icons.language_outlined,
        tint: AdminTheme.purple,
        unavailable: true,
        subtitle: 'Sem fonte no painel',
      ),
      AdminKpiCard(
        label: 'Total de vendas\n(todas modalidades)',
        value: salesTotal,
        icon: Icons.payments_outlined,
        tint: AdminTheme.pink,
      ),
      AdminKpiCard(
        label: 'Denúncias',
        value: reportsLabel,
        icon: Icons.flag_outlined,
        tint: AdminTheme.orange,
        unavailable: reportsLabel == '—',
        subtitle: reportsSubtitle,
      ),
    ];
    if (wide) {
      return Column(
        children: [
          Row(
            children: [
              for (var i = 0; i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: cards[i]),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 3; i < 6; i++) ...[
                if (i > 3) const SizedBox(width: 10),
                Expanded(child: cards[i]),
              ],
            ],
          ),
        ],
      );
    }
    return Column(
      children: [
        for (var i = 0; i < cards.length; i += 2) ...[
          if (i > 0) const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: cards[i]),
              const SizedBox(width: 10),
              Expanded(child: cards[i + 1]),
            ],
          ),
        ],
      ],
    );
  }
}

class _AccountsDonut extends StatelessWidget {
  const _AccountsDonut({
    required this.compact,
    required this.users,
    required this.venues,
  });

  final bool compact;
  final int users;
  final int venues;

  @override
  Widget build(BuildContext context) {
    final total = users + venues;
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Novas contas criadas\n(Usuários x Locais)',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, height: 1.25),
          ),
          const SizedBox(height: 12),
          _DonutChartBlock(
            compact: compact,
            chart: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 42,
                sections: [
                  PieChartSectionData(
                    value: users.toDouble(),
                    color: AdminTheme.orange,
                    radius: 36,
                    title: '',
                  ),
                  PieChartSectionData(
                    value: venues.toDouble().clamp(0.001, double.infinity),
                    color: AdminTheme.purple,
                    radius: 36,
                    title: '',
                  ),
                ],
              ),
            ),
            legend: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  formatCount(total),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 28,
                  ),
                ),
                _legend('Usuários', AdminTheme.orange, users),
                _legend('Locais', AdminTheme.purple, venues),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _legend(String label, Color color, int value) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '$label · ${formatCount(value)}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _DonutChartBlock extends StatelessWidget {
  const _DonutChartBlock({
    required this.compact,
    required this.chart,
    required this.legend,
  });

  final bool compact;
  final Widget chart;
  final Widget legend;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return Column(
        children: [
          SizedBox(height: 160, child: chart),
          const SizedBox(height: 8),
          legend,
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: SizedBox(height: 160, child: chart),
        ),
        const SizedBox(width: 8),
        Expanded(flex: 2, child: legend),
      ],
    );
  }
}

class _SalesDonut extends StatelessWidget {
  const _SalesDonut({required this.compact, required this.revenue});

  final bool compact;
  final ProviderRevenue revenue;

  @override
  Widget build(BuildContext context) {
    final slices = [
      (revenue.pix, AdminTheme.green, 'PIX'),
      (revenue.card, AdminTheme.purple, 'Cartão'),
      (revenue.appStore, AdminTheme.orange, 'App Store'),
      (revenue.googlePlay, const Color(0xFF4285F4), 'Google Play'),
    ];
    final total = slices.fold<double>(0, (s, e) => s + e.$1);
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Vendas por modalidade',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(height: 12),
          _DonutChartBlock(
            compact: compact,
            chart: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 42,
                sections: [
                  for (final slice in slices)
                    if (slice.$1 > 0)
                      PieChartSectionData(
                        value: slice.$1,
                        color: slice.$2,
                        radius: 36,
                        title: '',
                      ),
                ],
              ),
            ),
            legend: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  formatBrl(total),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
                ),
                for (final slice in slices)
                  if (slice.$1 > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '${slice.$3} · ${formatBrl(slice.$1)}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProvidersBreakdown extends StatelessWidget {
  const _ProvidersBreakdown({required this.revenue});
  final ProviderRevenue revenue;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Por origem (mês atual)', style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          _row('Google Play', revenue.googlePlay),
          _row('Apple', revenue.appStore),
          _row('PIX', revenue.pix),
          _row('Cartão de crédito', revenue.card),
        ],
      ),
    );
  }

  Widget _row(String label, double value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(formatBrl(value), style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _RefundSection extends StatelessWidget {
  const _RefundSection({required this.position});
  final RefundPosition position;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Reembolsos e receita',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 6),
          Text(
            'Posição atual das vendas confirmadas em ${monthAbbrevFromYearMonth(position.yearMonth)}/${position.yearMonth.split('-').first}. Não é o fluxo de caixa nem o dinheiro devolvido no mês.',
            style: const TextStyle(color: AdminTheme.textSecondary, height: 1.35, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Text('Faturamento bruto · ${formatBrl(position.paidSalesBrl)}'),
          Text('Receita após reembolsos · ${formatBrl(position.revenueAfterRefundsBrl)}'),
          if (!position.revenueComplete)
            const Text(
              'Incompleta',
              style: TextStyle(color: AdminTheme.pink, fontWeight: FontWeight.w700),
            ),
          if (position.partialsWithoutAmount > 0)
            Text(
              position.partialsWithoutAmount == 1
                  ? '1 reembolso parcial sem valor informado. A receita calculada não é definitiva.'
                  : '${formatCount(position.partialsWithoutAmount)} reembolsos parciais sem valor informado. A receita calculada não é definitiva.',
              style: const TextStyle(color: AdminTheme.pink, fontWeight: FontWeight.w700, height: 1.35),
            ),
          if (position.refundReviewsOpen > 0)
            Text(
              position.refundReviewsOpen == 1
                  ? '1 reembolso com verificação necessária. Esse sinal não entra na receita nem nos reembolsos.'
                  : '${formatCount(position.refundReviewsOpen)} reembolsos com verificação necessária. Esses sinais não entram na receita nem nos reembolsos.',
              style: const TextStyle(color: AdminTheme.textSecondary, fontWeight: FontWeight.w700, height: 1.35),
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

class _HistoryChart extends StatelessWidget {
  const _HistoryChart({required this.history});
  final List<MonthlySales> history;

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) return const SizedBox.shrink();
    final maxY = history.fold<double>(0, (c, r) => r.grossRevenueBrl > c ? r.grossRevenueBrl : c);
    final chartMax = maxY <= 0 ? 1.0 : maxY * 1.2;
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Últimos 12 meses', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: BarChart(
              BarChartData(
                maxY: chartMax,
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      getTitlesWidget: (value, meta) {
                        final index = value.toInt();
                        if (index < 0 || index >= history.length) return const SizedBox.shrink();
                        return Text(
                          monthAbbrevFromYearMonth(history[index].yearMonth),
                          style: const TextStyle(fontSize: 10, color: AdminTheme.muted),
                        );
                      },
                    ),
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
                          color: AdminTheme.orange,
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

class _RecentAccounts extends StatelessWidget {
  const _RecentAccounts({required this.accounts});
  final List<RecentAccount> accounts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Últimas contas', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (accounts.isEmpty)
          const AdminCard(child: Text('Nenhuma conta recente.', style: TextStyle(color: AdminTheme.muted)))
        else
          AdminCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < accounts.length; i++) ...[
                  ListTile(
                    title: Text(accounts[i].displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${accounts[i].email}\n${roleLabel(accounts[i].role)}'),
                    isThreeLine: true,
                    onTap: () => pushAdminPage<bool>(
                      context,
                      location: '/contas/${Uri.encodeComponent(accounts[i].id)}',
                      builder: (_) => AccountDetailScreen(id: accounts[i].id),
                    ),
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
        const Text('Últimas vendas', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (sales.isEmpty)
          const AdminCard(child: Text('Nenhuma venda recente.', style: TextStyle(color: AdminTheme.muted)))
        else
          AdminCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < sales.length; i++) ...[
                  ListTile(
                    title: Text(sales[i].venueName, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${formatBrl(sales[i].amountPaid)} · ${sales[i].packageKey}'),
                    onTap: () => pushAdminPage<void>(
                      context,
                      location: '/vendas/${Uri.encodeComponent(sales[i].id)}',
                      builder: (_) => SaleDetailScreen(id: sales[i].id),
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

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    if (!it.moveNext()) return null;
    return it.current;
  }
}
