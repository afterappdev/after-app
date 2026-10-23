import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_api.dart';
import '../../data/admin_coupon.dart';

class CouponFormScreen extends StatefulWidget {
  const CouponFormScreen({super.key});

  @override
  State<CouponFormScreen> createState() => _CouponFormScreenState();
}

class _CouponFormScreenState extends State<CouponFormScreen> {
  final _code = TextEditingController();
  final _credits = TextEditingController();
  final _maxTotal = TextEditingController();
  final _maxPerVenue = TextEditingController(text: '1');
  DateTime? _startsAt;
  DateTime? _expiresAt;
  bool _active = true;
  AdminCouponCreditKind _creditKind = AdminCouponCreditKind.common;
  bool _saving = false;

  @override
  void dispose() {
    _code.dispose();
    _credits.dispose();
    _maxTotal.dispose();
    _maxPerVenue.dispose();
    super.dispose();
  }

  String? _validate() {
    if (_code.text.trim().isEmpty) return 'Informe o código do cupom.';
    final credits = int.tryParse(_credits.text.trim());
    if (credits == null || credits <= 0) {
      return 'A quantidade de créditos deve ser maior que zero.';
    }
    final perVenue = int.tryParse(_maxPerVenue.text.trim());
    if (perVenue == null || perVenue <= 0) {
      return 'O limite por estabelecimento deve ser maior que zero.';
    }
    final totalText = _maxTotal.text.trim();
    if (totalText.isNotEmpty) {
      final total = int.tryParse(totalText);
      if (total == null || total <= 0) {
        return 'O limite total deve ser maior que zero.';
      }
    }
    if (_startsAt != null && _expiresAt != null && !_expiresAt!.isAfter(_startsAt!)) {
      return 'A validade deve ser posterior ao início.';
    }
    return null;
  }

  String? _iso(DateTime? value) => value?.toUtc().toIso8601String();

  Future<void> _pickDate({required bool start}) async {
    final initial = (start ? _startsAt : _expiresAt) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _startsAt = picked;
      } else {
        _expiresAt = picked;
      }
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Criar cupom?'),
        content: Text(
          'O código ${_code.text.trim().toUpperCase()} concederá ${_credits.text.trim()} crédito(s) ${_creditKind.label}.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Criar')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await context.read<AdminApi>().createCoupon(
        code: _code.text.trim(),
        creditAmount: int.parse(_credits.text.trim()),
        creditKind: _creditKind,
        active: _active,
        startsAt: _iso(_startsAt),
        expiresAt: _iso(_expiresAt),
        maxRedemptions: _maxTotal.text.trim().isEmpty
            ? null
            : int.parse(_maxTotal.text.trim()),
        maxRedemptionsPerVenue: int.parse(_maxPerVenue.text.trim()),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _inputDecoration({String? hint, String? helper}) {
    return InputDecoration(
      hintText: hint,
      helperText: helper,
      helperMaxLines: 2,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AdminTheme.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AdminTheme.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AdminTheme.purple, width: 1.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= kAdminDesktopBreakpoint;
    return Scaffold(
      backgroundColor: AdminTheme.pageBackground,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(wide ? 28 : 12, 8, wide ? 28 : 12, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded),
                    onPressed: () => Navigator.maybePop(context),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Novo cupom',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 22,
                            color: AdminTheme.textPrimary,
                          ),
                        ),
                        Text(
                          'Crie um cupom de créditos',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AdminTheme.textSecondary.withValues(alpha: 0.95),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Perfil',
                    onPressed: () => onAdminProfileTap?.call(context),
                    icon: const Icon(Icons.account_circle_outlined, size: 30),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(wide ? 28 : 20, 12, wide ? 28 : 20, 24),
                children: [
                  _SectionLabel(icon: Icons.tag_outlined, title: 'Código'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: _inputDecoration(
                      hint: 'Ex.: GANHOU5',
                      helper: 'Use letras e números, sem espaços.',
                    ),
                  ),
                  const SizedBox(height: 20),
                  _SectionLabel(icon: Icons.category_outlined, title: 'Tipo de crédito'),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _CreditKindCard(
                          label: 'Comum',
                          description: 'Créditos padrão do aplicativo',
                          icon: Icons.monetization_on_outlined,
                          accent: AdminTheme.orange,
                          selected: _creditKind == AdminCouponCreditKind.common,
                          onTap: () => setState(
                            () => _creditKind = AdminCouponCreditKind.common,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _CreditKindCard(
                          label: 'VIP',
                          description: 'Créditos VIP com benefícios',
                          icon: Icons.workspace_premium_outlined,
                          accent: AdminTheme.pink,
                          selected: _creditKind == AdminCouponCreditKind.vip,
                          onTap: () => setState(
                            () => _creditKind = AdminCouponCreditKind.vip,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _SectionLabel(icon: Icons.confirmation_number_outlined, title: 'Quantidade de créditos'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _credits,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: _inputDecoration(hint: 'Ex.: 5'),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SectionLabel(icon: Icons.event_outlined, title: 'Início (opcional)'),
                            const SizedBox(height: 8),
                            _DateField(
                              label: _startsAt == null ? 'Selecionar data' : _label(_startsAt!),
                              onTap: () => _pickDate(start: true),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SectionLabel(icon: Icons.event_available_outlined, title: 'Validade (opcional)'),
                            const SizedBox(height: 8),
                            _DateField(
                              label: _expiresAt == null ? 'Selecionar data' : _label(_expiresAt!),
                              onTap: () => _pickDate(start: false),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _SectionLabel(icon: Icons.all_inbox_outlined, title: 'Limite total de utilizações'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _maxTotal,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: _inputDecoration(
                      hint: 'Deixe vazio para não limitar',
                      helper: 'Quantidade máxima de vezes que o cupom pode ser usado.',
                    ),
                  ),
                  const SizedBox(height: 20),
                  _SectionLabel(icon: Icons.storefront_outlined, title: 'Limite por estabelecimento'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _maxPerVenue,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: _inputDecoration(
                      helper: 'Quantidade máxima de vezes que cada estabelecimento pode usar este cupom.',
                    ),
                  ),
                  const SizedBox(height: 16),
                  AdminCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'Ativo',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              Text(
                                'Cupom disponível para uso.',
                                style: TextStyle(color: AdminTheme.textSecondary, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        Switch(
                          value: _active,
                          activeThumbColor: AdminTheme.orange,
                          onChanged: (value) => setState(() => _active = value),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    height: 52,
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: AdminTheme.orange,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        _saving ? 'Salvando...' : 'Criar cupom',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
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

  String _label(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day/$month/${value.year}';
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AdminTheme.purple, size: 20),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 14,
            color: AdminTheme.textPrimary,
          ),
        ),
      ],
    );
  }
}

class _CreditKindCard extends StatelessWidget {
  const _CreditKindCard({
    required this.label,
    required this.description,
    required this.icon,
    required this.accent,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String description;
  final IconData icon;
  final Color accent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: const EdgeInsets.all(12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
          border: Border.all(
            color: selected ? accent : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? accent : AdminTheme.textSecondary,
              size: 22,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, color: accent, size: 20),
                      const SizedBox(width: 6),
                      Text(
                        label,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: selected ? accent : AdminTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 11,
                      height: 1.3,
                      color: AdminTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AdminTheme.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: label.startsWith('Selecionar')
                        ? AdminTheme.textSecondary
                        : AdminTheme.textPrimary,
                  ),
                ),
              ),
              const Icon(Icons.calendar_today_outlined, size: 18, color: AdminTheme.purple),
            ],
          ),
        ),
      ),
    );
  }
}
