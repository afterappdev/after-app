import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import 'report_reasons.dart';

const _accent = Color(0xFFF58634);
const _ink = Color(0xFF282829);
const _muted = Color(0xFF8B8B96);

Future<bool> ensureSignedIn(BuildContext context) async {
  final auth = context.read<AuthController>();
  if (auth.user != null) return true;
  await Navigator.of(context).pushNamed(AppRoutes.login);
  if (!context.mounted) return false;
  return context.read<AuthController>().user != null;
}

Future<void> showReportSheet(
  BuildContext context, {
  required ReportTargetType targetType,
  required String targetId,
}) async {
  if (targetId.isEmpty) return;
  final loggedIn = await ensureSignedIn(context);
  if (!loggedIn || !context.mounted) return;

  final submitted = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: ReportSheet(
          targetType: targetType,
          onSubmit: (reason, description) async {
            final api = context.read<ApiClient>();
            await api.post(
              '/reports',
              body: {
                'targetType': targetType.apiValue,
                'targetId': targetId,
                'reason': reason.apiValue,
                if (description != null && description.isNotEmpty)
                  'description': description,
              },
            );
          },
        ),
      );
    },
  );
  if (submitted == true && context.mounted) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(reportSuccessMessage)),
    );
  }
}

class ReportSheet extends StatefulWidget {
  const ReportSheet({
    super.key,
    required this.onSubmit,
    this.targetType = ReportTargetType.venue,
  });

  final ReportTargetType targetType;
  final Future<void> Function(ReportReason reason, String? description)
      onSubmit;

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  ReportReason? _reason;
  bool _submitting = false;
  String? _error;
  final _description = TextEditingController();

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null) {
      setState(() => _error = 'Escolha um motivo para continuar.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final extra = _description.text.trim();
      await widget.onSubmit(reason, extra.isEmpty ? null : extra);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Não foi possível enviar a denúncia.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Denunciar conteúdo',
              key: Key('report-sheet-title'),
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: _ink,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Selecione o motivo. Nossa equipe vai analisar a denúncia.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 13,
                color: _muted,
              ),
            ),
            const SizedBox(height: 12),
            for (final reason in ReportReason.values)
              ListTile(
                key: Key('report-reason-${reason.apiValue}'),
                contentPadding: EdgeInsets.zero,
                onTap: _submitting
                    ? null
                    : () => setState(() {
                          _reason = reason;
                          _error = null;
                        }),
                leading: Icon(
                  _reason == reason
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: _reason == reason ? _accent : _muted,
                ),
                title: Text(
                  reason.label,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: _ink,
                  ),
                ),
              ),
            if (_reason == ReportReason.other) ...[
              const SizedBox(height: 4),
              TextField(
                key: const Key('report-description'),
                controller: _description,
                enabled: !_submitting,
                maxLength: 500,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Descreva o problema (opcional)',
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                key: const Key('report-error'),
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  color: Color(0xFFE53935),
                  fontSize: 13,
                ),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              height: 48,
              child: FilledButton(
                key: const Key('report-submit'),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Enviar denúncia'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ContentReportButton extends StatelessWidget {
  const ContentReportButton({
    super.key,
    required this.targetType,
    required this.targetId,
  });

  final ReportTargetType targetType;
  final String targetId;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: Key('report-menu-${targetType.apiValue}-$targetId'),
      tooltip: 'Denunciar',
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF9A9AA3)),
      onPressed: () => showReportSheet(
        context,
        targetType: targetType,
        targetId: targetId,
      ),
    );
  }
}
