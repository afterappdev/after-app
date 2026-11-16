import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_finance.dart';
import '../sales/sales_overview.dart' show yearMonthLabelPt;
import 'finance_controller.dart';

Color financeCategoryColor(AdminFinanceCategory category) {
  return switch (category) {
    AdminFinanceCategory.vendas => AdminTheme.purple,
    AdminFinanceCategory.infraestrutura => AdminTheme.orange,
    AdminFinanceCategory.marketing => const Color(0xFFE8A87C),
    AdminFinanceCategory.outros => AdminTheme.textSecondary,
  };
}

class FinanceMonthFilter extends StatelessWidget {
  const FinanceMonthFilter({super.key, required this.controller});

  final FinanceController controller;

  @override
  Widget build(BuildContext context) {
    final dropdown = DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        isExpanded: true,
        value: controller.yearMonth,
        items: [
          for (final ym in controller.monthOptions)
            DropdownMenuItem(
              value: ym,
              child: Text(
                yearMonthLabelPt(ym),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
        onChanged: controller.loading
            ? null
            : (value) {
                if (value != null) controller.setYearMonth(value);
              },
      ),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 480;
        return AdminCard(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: narrow
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.calendar_month_outlined, color: AdminTheme.purple, size: 22),
                        SizedBox(width: 8),
                        Text('Filtrar por mês', style: TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                    dropdown,
                  ],
                )
              : Row(
                  children: [
                    const Icon(Icons.calendar_month_outlined, color: AdminTheme.purple, size: 22),
                    const SizedBox(width: 8),
                    const Text('Filtrar por mês', style: TextStyle(fontWeight: FontWeight.w700)),
                    const Spacer(),
                    SizedBox(width: 220, child: dropdown),
                  ],
                ),
        );
      },
    );
  }
}

class FinanceKpiGrid extends StatelessWidget {
  const FinanceKpiGrid({super.key, required this.overview});

  final AdminFinanceOverview overview;

  @override
  Widget build(BuildContext context) {
    final through = overview.accumulatedThrough;
    final throughLabel = through == null
        ? '—'
        : 'até ${DateFormat('dd/MM/yyyy', 'pt_BR').format(through.toLocal())}';
    final cards = [
      _Kpi(
        label: 'Total de entradas',
        value: formatBrl(overview.month.inflowBrl),
        subtitle: '${formatCount(overview.month.inflowCount)} itens',
        icon: Icons.arrow_upward_rounded,
        tint: AdminTheme.green,
        background: const Color(0xFFE8F8EF),
      ),
      _Kpi(
        label: 'Total de saídas',
        value: formatBrl(overview.month.outflowBrl),
        subtitle: '${formatCount(overview.month.outflowCount)} itens',
        icon: Icons.arrow_downward_rounded,
        tint: AdminTheme.pink,
        background: const Color(0xFFFFF0EE),
      ),
      _Kpi(
        label: 'Saldo do mês',
        value: formatBrl(overview.monthBalanceBrl),
        subtitle: yearMonthLabelPt(overview.yearMonth),
        icon: Icons.account_balance_wallet_outlined,
        tint: AdminTheme.purple,
        background: const Color(0xFFF4F1FF),
      ),
      _Kpi(
        label: 'Saldo acumulado',
        value: formatBrl(overview.accumulatedBalanceBrl),
        subtitle: throughLabel,
        icon: Icons.savings_outlined,
        tint: const Color(0xFF4C1D95),
        background: const Color(0xFFF3EEFF),
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        if (wide) {
          return Row(
            children: [
              for (var i = 0; i < cards.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: cards[i]),
              ],
            ],
          );
        }
        return Column(
          children: [
            for (var i = 0; i < cards.length; i += 2) ...[
              if (i > 0) const SizedBox(height: 10),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: cards[i]),
                    if (i + 1 < cards.length) ...[
                      const SizedBox(width: 10),
                      Expanded(child: cards[i + 1]),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.label,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.tint,
    required this.background,
  });

  final String label;
  final String value;
  final String subtitle;
  final IconData icon;
  final Color tint;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        border: Border.all(color: background.withValues(alpha: 0.65)),
        boxShadow: AdminTheme.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE8E8E8)),
            ),
            child: Icon(icon, color: tint, size: 28),
          ),
          const SizedBox(height: 12),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12,
              height: 1.3,
              color: AdminTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              maxLines: 1,
              softWrap: false,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 22,
                height: 1.05,
                color: AdminTheme.textPrimary,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            maxLines: 2,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 12,
              height: 1.25,
              color: AdminTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class FinanceDailyChart extends StatelessWidget {
  const FinanceDailyChart({super.key, required this.points, required this.yearMonth});

  final List<AdminFinanceDailyPoint> points;
  final String yearMonth;

  @override
  Widget build(BuildContext context) {
    final labels = points.map((p) => p.date.substring(8)).toList();
    var maxY = 0.0;
    for (final p in points) {
      if (p.inflowBrl > maxY) maxY = p.inflowBrl;
      if (p.outflowBrl > maxY) maxY = p.outflowBrl;
    }
    final top = maxY <= 0 ? 1000.0 : maxY * 1.2;

    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final title = const Text(
                'Entradas e saídas por dia',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              );
              final month = Text(
                yearMonthLabelPt(yearMonth),
                style: const TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
              );
              if (constraints.maxWidth < 480) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.bar_chart_rounded, color: AdminTheme.purple, size: 22),
                        const SizedBox(width: 8),
                        Expanded(child: title),
                      ],
                    ),
                    Align(alignment: Alignment.centerRight, child: month),
                  ],
                );
              }
              return Row(
                children: [
                  const Icon(Icons.bar_chart_rounded, color: AdminTheme.purple, size: 22),
                  const SizedBox(width: 8),
                  Expanded(child: title),
                  month,
                ],
              );
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _dot(AdminTheme.green),
              const Text(' Entradas  ', style: TextStyle(fontSize: 11)),
              _dot(AdminTheme.pink),
              const Text(' Saídas', style: TextStyle(fontSize: 11)),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: points.isEmpty
                ? const Center(child: Text('Sem dados no período.'))
                : BarChart(
                    BarChartData(
                      maxY: top,
                      barGroups: [
                        for (var i = 0; i < points.length; i++)
                          BarChartGroupData(
                            x: i,
                            barRods: [
                              BarChartRodData(
                                toY: points[i].inflowBrl,
                                color: AdminTheme.green,
                                width: 6,
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                              ),
                              BarChartRodData(
                                toY: points[i].outflowBrl,
                                color: AdminTheme.pink,
                                width: 6,
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                              ),
                            ],
                          ),
                      ],
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 44,
                            getTitlesWidget: (value, _) => Text(
                              value >= 1000 ? 'R\$${(value / 1000).toStringAsFixed(0)}k' : 'R\$${value.toInt()}',
                              style: const TextStyle(fontSize: 9),
                            ),
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            getTitlesWidget: (value, _) {
                              final i = value.toInt();
                              if (i < 0 || i >= labels.length) return const SizedBox.shrink();
                              if (labels.length > 20 && i % 3 != 0) return const SizedBox.shrink();
                              return Text(labels[i], style: const TextStyle(fontSize: 9));
                            },
                          ),
                        ),
                      ),
                      gridData: const FlGridData(show: false),
                      borderData: FlBorderData(show: false),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _dot(Color color) {
    return Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
  }
}

class FinanceMovementsTable extends StatelessWidget {
  const FinanceMovementsTable({super.key, required this.items});

  final List<AdminFinanceMovement> items;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                Text('Últimas movimentações', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AdminTheme.border), bottom: BorderSide(color: AdminTheme.border)),
            ),
            child: const Row(
              children: [
                Expanded(flex: 2, child: Text('Data', style: _hdr)),
                Expanded(child: Text('Tipo', style: _hdr)),
                Expanded(flex: 2, child: Text('Descrição', style: _hdr)),
                Expanded(child: Text('Categoria', style: _hdr)),
                Expanded(child: Text('Valor', style: _hdr)),
                Expanded(child: Text('Usuário', style: _hdr)),
              ],
            ),
          ),
          for (var i = 0; i < items.length; i++) ...[
            _MovementRow(item: items[i]),
            if (i != items.length - 1)
              const Divider(height: 1, indent: 14, endIndent: 14),
          ],
        ],
      ),
    );
  }

  static const _hdr = TextStyle(fontWeight: FontWeight.w700, fontSize: 11, color: AdminTheme.textSecondary);
}

class FinanceMovementMobileCard extends StatelessWidget {
  const FinanceMovementMobileCard({super.key, required this.item});

  final AdminFinanceMovement item;

  @override
  Widget build(BuildContext context) {
    final inflow = item.direction == AdminFinanceDirection.inflow;
    final color = inflow ? AdminTheme.green : AdminTheme.pink;
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: color.withValues(alpha: 0.12),
            child: Icon(
              inflow ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
              color: color,
              size: 20,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.description, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 4),
                Text(formatDateTime(item.occurredAt), style: const TextStyle(fontSize: 11, color: AdminTheme.textSecondary)),
                const SizedBox(height: 6),
                _CategoryPill(category: item.category),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatBrl(item.amountBrl),
                style: TextStyle(fontWeight: FontWeight.w800, color: color),
              ),
              Text(item.actorLabel, style: const TextStyle(fontSize: 10, color: AdminTheme.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MovementRow extends StatelessWidget {
  const _MovementRow({required this.item});

  final AdminFinanceMovement item;

  @override
  Widget build(BuildContext context) {
    final inflow = item.direction == AdminFinanceDirection.inflow;
    final color = inflow ? AdminTheme.green : AdminTheme.pink;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(formatDateTime(item.occurredAt), style: const TextStyle(fontSize: 11)),
          ),
          Expanded(
            child: Text(
              inflow ? 'Entrada' : 'Saída',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(item.description, style: const TextStyle(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          Expanded(child: _CategoryPill(category: item.category)),
          Expanded(
            child: Text(
              formatBrl(item.amountBrl),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color),
            ),
          ),
          Expanded(
            child: Text(item.actorLabel, style: const TextStyle(fontSize: 11)),
          ),
        ],
      ),
    );
  }
}

class _CategoryPill extends StatelessWidget {
  const _CategoryPill({required this.category});

  final AdminFinanceCategory category;

  @override
  Widget build(BuildContext context) {
    final color = financeCategoryColor(category);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        category.label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

class FinancePaginationBar extends StatelessWidget {
  const FinancePaginationBar({super.key, required this.controller});

  final FinanceController controller;

  @override
  Widget build(BuildContext context) {
    final total = controller.totalItems;
    if (total == 0) return const SizedBox.shrink();
    final page = controller.page;
    final limit = controller.pageLimit;
    final from = (page - 1) * limit + 1;
    final to = page * limit > total ? total : page * limit;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Text(
        'Mostrando $from a $to de ${formatCount(total)} movimentações',
        style: const TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
      ),
    );
  }
}
