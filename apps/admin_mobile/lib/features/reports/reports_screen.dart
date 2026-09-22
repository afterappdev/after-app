import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/widgets/status_body.dart';
import 'report_detail_screen.dart';
import 'reports_controller.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ReportsController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ReportsController>();
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              _statusChip(controller, 'Pendentes', 'PENDING'),
              const SizedBox(width: 8),
              _statusChip(controller, 'Em análise', 'REVIEWING'),
              const SizedBox(width: 8),
              _statusChip(controller, 'Resolvidas', 'RESOLVED'),
              const SizedBox(width: 8),
              _statusChip(controller, 'Rejeitadas', 'REJECTED'),
              const SizedBox(width: 8),
              _statusChip(controller, 'Todas', null),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _typeChip(controller, 'Todos os tipos', null),
              const SizedBox(width: 8),
              _typeChip(controller, 'Estabelecimento', 'VENUE'),
              const SizedBox(width: 8),
              _typeChip(controller, 'Promoção', 'BANNER'),
              const SizedBox(width: 8),
              _typeChip(controller, 'Foto', 'PHOTO'),
              const SizedBox(width: 8),
              _typeChip(controller, 'Vídeo', 'VIDEO'),
              const SizedBox(width: 8),
              _typeChip(controller, 'Avaliação', 'REVIEW'),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(child: _list(controller)),
      ],
    );
  }

  Widget _statusChip(ReportsController controller, String label, String? status) {
    final selected = controller.status == status;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => controller.setStatus(status),
    );
  }

  Widget _typeChip(ReportsController controller, String label, String? type) {
    final selected = controller.targetType == type;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => controller.setTargetType(type),
    );
  }

  Widget _list(ReportsController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando denúncias...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(
        message: controller.error!,
        onRetry: controller.load,
      );
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma denúncia',
        message: 'Não encontramos denúncias com esses filtros.',
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
            final report = controller.items[index];
            return AdminCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                title: Text(
                  '${reportTargetLabel(report.targetType)} · ${report.targetLabel}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${reportReasonLabel(report.reason)}\n${reportStatusLabel(report.status)} · ${formatDate(report.createdAt)}',
                ),
                isThreeLine: true,
                onTap: () async {
                  final updated = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (_) => ReportDetailScreen(id: report.id),
                    ),
                  );
                  if (!context.mounted) return;
                  if (updated == true) {
                    await controller.load();
                  }
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
