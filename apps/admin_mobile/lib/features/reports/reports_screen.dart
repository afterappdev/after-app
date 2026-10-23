import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
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
      final c = context.read<ReportsController>();
      c.loadSummary();
      c.load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ReportsController>();
    return AdminScrollPage(
      title: 'Denúncias',
      subtitle: 'Gerencie as denúncias do After',
      onRefresh: () async {
        await controller.loadSummary();
        await controller.load();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(
                  child: _SummaryCard(
                    label: 'Pendentes',
                    value: formatCount(controller.pendingTotal),
                    icon: Icons.schedule_outlined,
                    tint: AdminTheme.orange,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'Em análise',
                    value: formatCount(controller.reviewingTotal),
                    icon: Icons.manage_search_outlined,
                    tint: AdminTheme.purple,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'Resolvidas',
                    value: formatCount(controller.resolvedTotal),
                    icon: Icons.check_circle_outline,
                    tint: AdminTheme.green,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          AdminFilterChipRow(
            children: [
              AdminFilterChip(
                label: 'Pendentes',
                selected: controller.status == 'PENDING',
                onTap: () => controller.setStatus('PENDING'),
              ),
              AdminFilterChip(
                label: 'Em análise',
                selected: controller.status == 'REVIEWING',
                onTap: () => controller.setStatus('REVIEWING'),
              ),
              AdminFilterChip(
                label: 'Resolvidas',
                selected: controller.status == 'RESOLVED',
                onTap: () => controller.setStatus('RESOLVED'),
              ),
              AdminFilterChip(
                label: 'Todas',
                selected: controller.status == null,
                onTap: () => controller.setStatus(null),
              ),
            ],
          ),
          const SizedBox(height: 8),
          AdminFilterChipRow(
            children: [
              AdminFilterChip(
                label: 'Todos',
                selected: controller.targetType == null,
                onTap: () => controller.setTargetType(null),
              ),
              AdminFilterChip(
                label: 'Estabelecimento',
                selected: controller.targetType == 'VENUE',
                onTap: () => controller.setTargetType('VENUE'),
              ),
              AdminFilterChip(
                label: 'Promoção',
                selected: controller.targetType == 'BANNER',
                onTap: () => controller.setTargetType('BANNER'),
              ),
              AdminFilterChip(
                label: 'Foto',
                selected: controller.targetType == 'PHOTO',
                onTap: () => controller.setTargetType('PHOTO'),
              ),
              AdminFilterChip(
                label: 'Vídeo',
                selected: controller.targetType == 'VIDEO',
                onTap: () => controller.setTargetType('VIDEO'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _list(controller),
        ],
      ),
    );
  }

  Widget _list(ReportsController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando denúncias...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(message: controller.error!, onRetry: controller.load);
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma denúncia',
        message: 'Não encontramos denúncias com esses filtros.',
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
        itemCount: controller.items.length + (controller.loadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index >= controller.items.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final report = controller.items[index];
          final thumb = report.targetSnapshot['imageUrl']?.toString() ??
              report.targetSnapshot['logoUrl']?.toString();
          return AdminCard(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
            child: InkWell(
              onTap: () async {
                final updated = await pushAdminPage<bool>(
                  context,
                  location: '/denuncias/${Uri.encodeComponent(report.id)}',
                  builder: (_) => ReportDetailScreen(id: report.id),
                );
                if (!context.mounted) return;
                if (updated == true) {
                  await controller.loadSummary();
                  await controller.load();
                }
              },
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Thumb(url: thumb),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reportTargetLabel(report.targetType),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AdminTheme.orange,
                          ),
                        ),
                        Text(
                          report.targetLabel,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          reportReasonLabel(report.reason),
                          style: const TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
                        ),
                        Text(
                          formatDateTime(report.createdAt),
                          style: const TextStyle(fontSize: 11, color: AdminTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      Text(
                        reportStatusLabel(report.status),
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: tint, size: 22),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
          Text(label, style: const TextStyle(fontSize: 11, color: AdminTheme.textSecondary)),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) {
      return Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: AdminTheme.sageSoft,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.image_outlined, color: AdminTheme.textSecondary),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.network(
        url!,
        width: 52,
        height: 52,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Container(
          width: 52,
          height: 52,
          color: AdminTheme.sageSoft,
          child: const Icon(Icons.broken_image_outlined),
        ),
      ),
    );
  }
}
