import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_api.dart';
import '../../data/admin_report.dart';

class ReportDetailScreen extends StatefulWidget {
  const ReportDetailScreen({super.key, required this.id});

  final String id;

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  AdminReportDetail? data;
  String? error;
  bool loading = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final detail = await context.read<AdminApi>().report(widget.id);
      if (!mounted) return;
      setState(() {
        data = detail;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  bool get _closed {
    final status = data?.status;
    return status == 'RESOLVED' || status == 'REJECTED';
  }

  Future<void> _moderate({
    required String status,
    required String confirmTitle,
    required String confirmBody,
    bool removeContent = false,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(confirmTitle),
        content: Text(confirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: Key('admin-report-$status'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => saving = true);
    try {
      final updated = await context.read<AdminApi>().moderateReport(
            widget.id,
            status: status,
            removeContent: removeContent,
          );
      if (!mounted) return;
      setState(() {
        data = updated;
        saving = false;
      });
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => saving = false);
      final message = e is ApiException
          ? e.message
          : 'Não foi possível atualizar a denúncia.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  Future<void> _restoreVenue() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reexibir estabelecimento?'),
        content: const Text(
          'O estabelecimento voltará a aparecer nas listagens e no acesso direto. '
          'A denúncia original permanece no histórico, sem alteração de status.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('admin-report-restore-venue'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => saving = true);
    try {
      final updated = await context.read<AdminApi>().restoreVenue(widget.id);
      if (!mounted) return;
      setState(() {
        data = updated;
        saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => saving = false);
      final message = e is ApiException
          ? e.message
          : 'Não foi possível reexibir o estabelecimento.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Denúncia')),
      body: loading
          ? const StatusBody.loading()
          : error != null
          ? StatusBody.error(message: error!, onRetry: _load)
          : _body(data!),
    );
  }

  Widget _body(AdminReportDetail report) {
    final snapshot = report.targetSnapshot;
    final imageUrl = (snapshot['imageUrl'] ?? snapshot['url'] ?? snapshot['logoUrl'])
        ?.toString();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row('Status', reportStatusLabel(report.status)),
              _row('Tipo', reportTargetLabel(report.targetType)),
              _row('Motivo', reportReasonLabel(report.reason)),
              _row('Conteúdo', report.targetLabel),
              _row('ID do conteúdo', report.targetId),
              _row('Data', formatDateTime(report.createdAt)),
              _row('Denunciante', report.reporterName ?? 'Conta removida'),
              if (report.description != null && report.description!.isNotEmpty)
                _row('Descrição', report.description!),
              if (report.reviewedByName != null)
                _row('Moderado por', report.reviewedByName!),
              if (report.resolvedAt != null)
                _row('Resolvida em', formatDateTime(report.resolvedAt)),
              if (report.adminNote != null && report.adminNote!.isNotEmpty)
                _row('Nota administrativa', report.adminNote!),
              if (report.venueHidden)
                _row('Visibilidade', 'Oculto por moderação'),
              if (report.contentRestoredAt != null)
                _row(
                  'Reexibido em',
                  formatDateTime(report.contentRestoredAt),
                ),
              if (report.contentRestoredByName != null)
                _row('Reexibido por', report.contentRestoredByName!),
            ],
          ),
        ),
        if (imageUrl != null && imageUrl.isNotEmpty) ...[
          const SizedBox(height: 16),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Prévia',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    imageUrl,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const SizedBox(
                      height: 80,
                      child: Center(child: Text('Prévia indisponível')),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (snapshot['testimonial'] != null) ...[
          const SizedBox(height: 16),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Avaliação denunciada',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  '${snapshot['rating'] ?? ''}★  ${snapshot['authorName'] ?? ''}',
                ),
                const SizedBox(height: 8),
                Text('${snapshot['testimonial']}'),
              ],
            ),
          ),
        ],
        if (!_closed) ...[
          const SizedBox(height: 20),
          FilledButton(
            onPressed: saving
                ? null
                : () => _moderate(
                      status: 'REVIEWING',
                      confirmTitle: 'Colocar em análise?',
                      confirmBody:
                          'A denúncia ficará marcada como em análise.',
                    ),
            child: const Text('Colocar em análise'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: saving
                ? null
                : () => _moderate(
                      status: 'REJECTED',
                      confirmTitle: 'Rejeitar denúncia?',
                      confirmBody:
                          'A denúncia será descartada e o conteúdo permanece publicado.',
                    ),
            child: const Text('Rejeitar denúncia'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: saving
                ? null
                : () => _moderate(
                      status: 'RESOLVED',
                      confirmTitle: 'Resolver denúncia?',
                      confirmBody:
                          'A denúncia será encerrada sem remover o conteúdo automaticamente.',
                    ),
            child: const Text('Resolver denúncia'),
          ),
          const SizedBox(height: 10),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFB3261E),
            ),
            onPressed: saving
                ? null
                : () => _moderate(
                      status: 'RESOLVED',
                      removeContent: true,
                      confirmTitle: 'Remover ou ocultar conteúdo?',
                      confirmBody:
                          'Esta ação remove ou oculta o conteúdo denunciado e resolve a denúncia. Não exclui a conta automaticamente.',
                    ),
            child: const Text('Resolver e remover conteúdo'),
          ),
        ],
        if (report.targetType == 'VENUE' && report.venueHidden) ...[
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('admin-report-restore-venue-action'),
            onPressed: saving ? null : _restoreVenue,
            child: const Text('Reexibir estabelecimento'),
          ),
        ],
        if (saving) ...[
          const SizedBox(height: 16),
          const Center(child: CircularProgressIndicator()),
        ],
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AdminTheme.muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
