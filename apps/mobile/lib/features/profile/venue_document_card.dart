import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/br_document_validator.dart';
import '../credits/fiscal_invoice_controller.dart';

/// Later fill for venues created before CPF/CNPJ was required.
/// The value stays in memory only while this card is open.
class VenueDocumentCard extends StatefulWidget {
  const VenueDocumentCard({super.key, required this.venueId});

  final String venueId;

  @override
  State<VenueDocumentCard> createState() => _VenueDocumentCardState();
}

class _VenueDocumentCardState extends State<VenueDocumentCard> {
  static const _accent = Color(0xFFF58634);
  final _document = TextEditingController();
  String _type = 'CPF';
  String? _savedMasked;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _document.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<ApiClient>().get(
            '/venues/${widget.venueId}/fiscal-document',
          );
      if (!mounted || data is! Map) return;
      final type = data['documentType']?.toString();
      final digits = data['documentDigits']?.toString() ?? '';
      setState(() {
        _loading = false;
        if (type == 'CPF' || type == 'CNPJ') {
          _type = type!;
          _savedMasked = type == 'CNPJ'
              ? BrDocumentValidator.formatCnpj(digits)
              : BrDocumentValidator.formatCpf(digits);
        }
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _error() {
    final digits = BrDocumentValidator.digitsOnly(_document.text);
    if (digits.isEmpty) return 'Informe um CPF ou CNPJ.';
    if (_type == 'CNPJ') {
      return BrDocumentValidator.isValidCnpj(digits) ? null : 'CNPJ inválido.';
    }
    return BrDocumentValidator.isValidCpf(digits) ? null : 'CPF inválido.';
  }

  Future<void> _save() async {
    final error = _error();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _saving = true);
    try {
      final data = await context.read<ApiClient>().put(
            '/venues/${widget.venueId}/fiscal-document',
            body: {
              'documentType': _type,
              'documentNumber': BrDocumentValidator.digitsOnly(_document.text),
            },
          );
      if (!mounted) return;
      final digits = data is Map ? data['documentDigits']?.toString() ?? '' : '';
      setState(() {
        _savedMasked = _type == 'CNPJ'
            ? BrDocumentValidator.formatCnpj(digits)
            : BrDocumentValidator.formatCpf(digits);
        _document.clear();
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 16),
        child: LinearProgressIndicator(color: _accent, minHeight: 2),
      );
    }
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Documento fiscal',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: Color(0xFF282829),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _savedMasked == null
                ? 'Informe o CPF ou CNPJ do estabelecimento. Contas antigas continuam podendo entrar.'
                : 'Documento informado: $_savedMasked',
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              color: Color(0xFF8B8B96),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _typeButton('CPF')),
              const SizedBox(width: 8),
              Expanded(child: _typeButton('CNPJ')),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('venue-document-input'),
            controller: _document,
            keyboardType: TextInputType.number,
            inputFormatters: [
              BrDocumentInputFormatter(cnpj: _type == 'CNPJ'),
            ],
            decoration: InputDecoration(
              hintText: _type == 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00',
              filled: true,
              fillColor: const Color(0xFFF7F7F8),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('venue-document-save'),
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: _accent),
              child: Text(_saving ? 'Salvando...' : 'Salvar documento'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _typeButton(String type) {
    final selected = _type == type;
    return OutlinedButton(
      onPressed: () {
        final digits = BrDocumentValidator.digitsOnly(_document.text);
        setState(() {
          _type = type;
          _document.text = type == 'CNPJ'
              ? BrDocumentValidator.formatCnpj(digits)
              : BrDocumentValidator.formatCpf(digits);
        });
      },
      style: OutlinedButton.styleFrom(
        foregroundColor: selected ? Colors.white : const Color(0xFF282829),
        backgroundColor: selected ? _accent : Colors.white,
        side: BorderSide(color: selected ? _accent : const Color(0xFFE8E8EE)),
      ),
      child: Text(type),
    );
  }
}
