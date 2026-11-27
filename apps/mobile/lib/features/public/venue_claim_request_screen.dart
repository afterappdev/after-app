import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
class VenueClaimRequestScreen extends StatefulWidget {
  const VenueClaimRequestScreen({super.key, required this.venueId});

  final String venueId;

  @override
  State<VenueClaimRequestScreen> createState() =>
      _VenueClaimRequestScreenState();
}

class _VenueClaimRequestScreenState extends State<VenueClaimRequestScreen> {
  final _name = TextEditingController();
  final _role = TextEditingController();
  final _email = TextEditingController();
  final _whatsapp = TextEditingController();
  bool _submitting = false;
  String? _protocol;
  String? _venueName;

  @override
  void initState() {
    super.initState();
    _loadVenue();
  }

  Future<void> _loadVenue() async {
    try {
      final data = await context.read<ApiClient>().get(
            '/venues/${widget.venueId}',
          ) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _venueName = data['name']?.toString());
    } catch (_) {
      // Form still works without the title.
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _role.dispose();
    _email.dispose();
    _whatsapp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final requesterName = _name.text.trim();
    final email = _email.text.trim();
    if (requesterName.length < 2) {
      _toast('Informe seu nome.');
      return;
    }
    if (!email.contains('@')) {
      _toast('Informe um e-mail válido.');
      return;
    }
    final role = _role.text.trim();
    if (role.length < 2) {
      _toast('Informe seu cargo ou vínculo com o local.');
      return;
    }
    final whatsapp = _whatsapp.text.trim();
    final whatsappDigits = whatsapp.replaceAll(RegExp(r'\D'), '');
    if (whatsappDigits.length < 10) {
      _toast('Informe um WhatsApp válido.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final data = await context.read<ApiClient>().post(
            '/venues/${widget.venueId}/claim-requests',
            body: {
              'requesterName': requesterName,
              'requesterRole': role,
              'email': email,
              'whatsapp': whatsapp,
            },
          ) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _protocol = data['protocol']?.toString());
    } on ApiException catch (e) {
      if (!mounted) return;
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final title = _venueName ?? 'Solicitar acesso ao perfil';
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F7),
      appBar: AppBar(
        title: const Text('Reivindicar perfil'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF282829),
        elevation: 0,
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: _protocol != null
                ? _Success(protocol: _protocol!)
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w700,
                          fontSize: 22,
                          color: Color(0xFF282829),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Preencha os dados abaixo. A equipe After conferirá '
                        'seu vínculo com o estabelecimento e entrará em contato.',
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 14,
                          color: Color(0xFF6B6B75),
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 24),
                      _field('Nome completo', _name),
                      const SizedBox(height: 12),
                      _field('Cargo ou vínculo', _role),
                      const SizedBox(height: 12),
                      _field(
                        'E-mail para acesso',
                        _email,
                        keyboard: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 12),
                      _field(
                        'WhatsApp',
                        _whatsapp,
                        keyboard: TextInputType.phone,
                        hint: '(xx) xxxxx-xxxx',
                        formatters: const [_BrMobilePhoneFormatter()],
                        floatLabel: true,
                      ),
                      const SizedBox(height: 28),
                      FilledButton(
                        onPressed: _submitting ? null : _submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF6B4EFF),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: _submitting
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Enviar solicitação'),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    bool optional = false,
    TextInputType? keyboard,
    String? hint,
    List<TextInputFormatter>? formatters,
    bool floatLabel = false,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboard,
      inputFormatters: formatters,
      decoration: InputDecoration(
        labelText: optional ? '$label (opcional)' : label,
        hintText: hint,
        floatingLabelBehavior: floatLabel
            ? FloatingLabelBehavior.always
            : FloatingLabelBehavior.auto,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

class _BrMobilePhoneFormatter extends TextInputFormatter {
  const _BrMobilePhoneFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final capped = digits.length > 11 ? digits.substring(0, 11) : digits;
    final buffer = StringBuffer();
    for (var i = 0; i < capped.length; i++) {
      if (i == 0) buffer.write('(');
      if (i == 2) buffer.write(') ');
      if (i == 7) buffer.write('-');
      buffer.write(capped[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class _Success extends StatelessWidget {
  const _Success({required this.protocol});

  final String protocol;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.check_circle_outline, size: 48, color: Color(0xFF2E7D32)),
        const SizedBox(height: 16),
        const Text(
          'Solicitação recebida',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w700,
            fontSize: 22,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Protocolo: $protocol',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 14,
            color: Color(0xFF6B6B75),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'A equipe After entrará em contato por e-mail ou WhatsApp. '
          'Confira em sua caixa de spam também, pois em alguns casos, '
          'o e-mail pode ser redirecionado pra lá.',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 14,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 24),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Voltar'),
        ),
      ],
    );
  }
}