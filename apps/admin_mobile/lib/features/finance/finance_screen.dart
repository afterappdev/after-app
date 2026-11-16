import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../../core/widgets/status_body.dart';
import 'finance_controller.dart';
import 'finance_form_panel.dart';
import 'finance_overview.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  bool _showCreatePanel = false;

  double _createPanelHeight(BuildContext context, BoxConstraints constraints) {
    if (constraints.maxHeight.isFinite && constraints.maxHeight > 0) {
      return constraints.maxHeight.clamp(480, 1200);
    }
    final viewport = MediaQuery.sizeOf(context).height;
    return (viewport - 96).clamp(480, 900);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FinanceController>().load();
    });
  }

  Future<void> _openCreate({required bool wide}) async {
    if (wide) {
      setState(() => _showCreatePanel = true);
      return;
    }
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AdminTheme.pageBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.92,
        minChildSize: 0.55,
        maxChildSize: 0.96,
        builder: (_, _) => const FinanceEntryFormPanel(),
      ),
    );
    if (created == true && mounted) {
      await context.read<FinanceController>().refreshAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<FinanceController>();
    final overview = controller.overview;

    return AdminScrollPage(
      title: 'Finanças',
      subtitle: 'Controle de entradas e saídas do After',
      onRefresh: controller.refreshAll,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 960;
          final body = Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: FinanceMonthFilter(controller: controller),
              ),
              if (!wide) ...[
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: SizedBox(
                    height: 50,
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => _openCreate(wide: false),
                      style: FilledButton.styleFrom(
                        backgroundColor: AdminTheme.orange,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      icon: const Icon(Icons.add),
                      label: const Text(
                        'Nova movimentação',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (controller.loadingOverview)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                )
              else if (overview != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: FinanceKpiGrid(overview: overview),
                ),
              const SizedBox(height: 12),
              if (overview != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: FinanceDailyChart(points: overview.daily, yearMonth: overview.yearMonth),
                ),
              const SizedBox(height: 14),
              _list(controller, wide: wide),
            ],
          );

          if (wide && _showCreatePanel) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: body),
                SizedBox(
                  width: 380,
                  height: _createPanelHeight(context, constraints),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(0, 0, 20, 20),
                    child: FinanceEntryFormPanel(
                      embedded: true,
                      onClose: () => setState(() => _showCreatePanel = false),
                      onCreated: () async {
                        setState(() => _showCreatePanel = false);
                        await controller.refreshAll();
                      },
                    ),
                  ),
                ),
              ],
            );
          }

          if (wide) {
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.icon(
                      onPressed: () => _openCreate(wide: true),
                      style: FilledButton.styleFrom(backgroundColor: AdminTheme.orange),
                      icon: const Icon(Icons.add),
                      label: const Text('Nova movimentação'),
                    ),
                  ),
                ),
                body,
              ],
            );
          }
          return body;
        },
      ),
    );
  }

  Widget _list(FinanceController controller, {required bool wide}) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando movimentações...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(message: controller.error!, onRetry: controller.load);
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma movimentação',
        message: 'Não há entradas ou saídas neste mês.',
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: wide
              ? FinanceMovementsTable(items: controller.items)
              : Column(
                  children: [
                    for (final item in controller.items) ...[
                      FinanceMovementMobileCard(item: item),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
        ),
        FinancePaginationBar(controller: controller),
      ],
    );
  }
}
