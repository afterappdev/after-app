import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/admin_theme.dart';
import '../../data/admin_api.dart';

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
          'O código ${_code.text.trim().toUpperCase()} concederá ${_credits.text.trim()} crédito(s) bônus.',
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Novo cupom')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _code,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'Código'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _credits,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Créditos'),
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Início'),
            subtitle: Text(_startsAt == null ? 'Opcional' : _label(_startsAt!)),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () => _pickDate(start: true),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Validade'),
            subtitle: Text(_expiresAt == null ? 'Opcional' : _label(_expiresAt!)),
            trailing: const Icon(Icons.event_outlined),
            onTap: () => _pickDate(start: false),
          ),
          TextField(
            controller: _maxTotal,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
              labelText: 'Limite total',
              helperText: 'Deixe vazio para não limitar',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _maxPerVenue,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Limite por estabelecimento'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Ativo'),
            value: _active,
            activeThumbColor: AdminTheme.orange,
            onChanged: (value) => setState(() => _active = value),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Salvando...' : 'Criar cupom'),
          ),
        ],
      ),
    );
  }

  String _label(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day/$month/${value.year}';
  }
}
