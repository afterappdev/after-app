import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import 'auth_controller.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  static const _accent = Color(0xFFF58634);
  static const _inputFill = Color(0xFFF2F5F4);
  static const _hint = Color(0xFF8A9391);
  static const _subtitle = Color(0xFF8A9391);
  static const _border = Color(0xFFC5D4CF);
  static const _disabledButton = Color(0xFFBDBDBD);
  static const _inputTextStyle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: Color(0xFF282829),
  );

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();

  /// Exactly one role: USER or VENUE. Never both, never none.
  String _role = 'USER';
  bool _loading = false;
  bool _obscurePassword = true;
  bool _obscureConfirm = true;

  List<Map<String, dynamic>> _states = [];
  List<Map<String, dynamic>> _cities = [];
  String? _selectedUf;
  String? _selectedCity;
  bool _loadingStates = true;
  bool _loadingCities = false;
  String? _locationsError;

  @override
  void initState() {
    super.initState();
    _name.addListener(_onFormChanged);
    _email.addListener(_onFormChanged);
    _password.addListener(_onFormChanged);
    _confirmPassword.addListener(_onFormChanged);
    _loadStates();
  }

  void _onFormChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _name
      ..removeListener(_onFormChanged)
      ..dispose();
    _email
      ..removeListener(_onFormChanged)
      ..dispose();
    _password
      ..removeListener(_onFormChanged)
      ..dispose();
    _confirmPassword
      ..removeListener(_onFormChanged)
      ..dispose();
    super.dispose();
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }

  bool get _canSubmit {
    return _isValidEmail(_email.text.trim()) &&
        _name.text.trim().length >= 2 &&
        _selectedUf != null &&
        _selectedCity != null &&
        _password.text.length >= 6 &&
        _password.text == _confirmPassword.text &&
        (_role == 'USER' || _role == 'VENUE') &&
        !_loading;
  }

  void _selectRole(String role) {
    if (role != 'USER' && role != 'VENUE') return;
    setState(() => _role = role);
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1A1A),
        content: Text(
          message,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Future<void> _loadStates() async {
    setState(() {
      _loadingStates = true;
      _locationsError = null;
    });
    try {
      final api = context.read<ApiClient>();
      final data = await api.get('/locations/states') as List<dynamic>;
      final states = data.cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _states = states;
        _loadingStates = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingStates = false;
        _locationsError = e.message;
      });
    }
  }

  Future<void> _loadCities(String uf) async {
    setState(() {
      _loadingCities = true;
      _selectedCity = null;
      _cities = [];
    });
    try {
      final api = context.read<ApiClient>();
      final data =
          await api.get('/locations/states/$uf/cities') as List<dynamic>;
      final cities = data.cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _cities = cities;
        _loadingCities = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingCities = false;
        _locationsError = e.message;
      });
    }
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final name = _name.text.trim();
    final password = _password.text;

    if (_role != 'USER' && _role != 'VENUE') {
      _showErrorSnackBar('Selecione se você é usuário ou estabelecimento.');
      return;
    }
    if (!_isValidEmail(email) || password.length < 6) {
      _showErrorSnackBar(
        'Preencha um email válido, e a senha deverá conter no mínimo 6 caracteres.',
      );
      return;
    }
    if (password != _confirmPassword.text) {
      _showErrorSnackBar('As senhas não coincidem.');
      return;
    }
    if (name.length < 2) {
      _showErrorSnackBar('Preencha o nome.');
      return;
    }
    if (_selectedUf == null || _selectedCity == null) {
      _showErrorSnackBar('Selecione o estado e a cidade.');
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<AuthController>().register(
            name: name,
            email: email,
            password: password,
            state: _selectedUf!,
            city: _selectedCity!,
            role: _role,
          );
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    final radius = BorderRadius.circular(14);
    return InputDecoration(
      hintText: hint,
      hintStyle: _inputTextStyle.copyWith(color: _hint),
      filled: true,
      fillColor: _inputFill,
      prefixIcon: Icon(icon, color: _accent, size: 22),
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _accent, width: 1.4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: const Color(0xFF333333),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(40, 4, 40, 32),
              children: [
                const AfterLogo(height: 48),
                const SizedBox(height: 16),
                Text(
                  'Crie sua conta',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: Color(0xFF282829),
                  ),
                ),
                const SizedBox(height: 8),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.verified_user_outlined, size: 16, color: _accent),
                    SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Todos os campos são obrigatórios',
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          color: _subtitle,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  'Tipo de conta',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: Color(0xFF282829),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _AccountTypeButton(
                        label: 'Usuário',
                        icon: Icons.person_outline_rounded,
                        selected: _role == 'USER',
                        onTap: () => _selectRole('USER'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _AccountTypeButton(
                        label: 'Local',
                        icon: Icons.apartment_outlined,
                        selected: _role == 'VENUE',
                        onTap: () => _selectRole('VENUE'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _email,
                  style: _inputTextStyle,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  decoration: _fieldDecoration(
                    hint: 'Digite seu e-mail',
                    icon: Icons.mail_outline_rounded,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _name,
                  style: _inputTextStyle,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                  decoration: _fieldDecoration(
                    hint: 'Nome ou nome do local',
                    icon: Icons.person_outline_rounded,
                  ),
                ),
                const SizedBox(height: 12),
                if (_locationsError != null) ...[
                  Text(
                    _locationsError!,
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  TextButton(
                    onPressed: _loadStates,
                    child: const Text('Tentar novamente'),
                  ),
                  const SizedBox(height: 8),
                ],
                DropdownButtonFormField<String>(
                  // ignore: deprecated_member_use
                  value: _selectedUf,
                  isExpanded: true,
                  icon: const Icon(Icons.keyboard_arrow_down_rounded, color: _hint),
                  dropdownColor: Colors.white,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    color: Color(0xFF282829),
                    fontSize: 13,
                  ),
                  decoration: _fieldDecoration(
                    hint: _loadingStates
                        ? 'Carregando estados...'
                        : 'Selecione seu estado',
                    icon: Icons.location_on_outlined,
                  ),
                  hint: Text(
                    _loadingStates
                        ? 'Carregando estados...'
                        : 'Selecione seu estado',
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      color: _hint,
                      fontSize: 13,
                    ),
                  ),
                  items: _states
                      .map(
                        (s) => DropdownMenuItem<String>(
                          value: s['uf'] as String,
                          child: Text('${s['uf']} — ${s['name']}'),
                        ),
                      )
                      .toList(),
                  onChanged: _loadingStates
                      ? null
                      : (uf) async {
                          if (uf == null) return;
                          setState(() => _selectedUf = uf);
                          await _loadCities(uf);
                        },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  // ignore: deprecated_member_use
                  value: _selectedCity,
                  isExpanded: true,
                  icon: const Icon(Icons.keyboard_arrow_down_rounded, color: _hint),
                  dropdownColor: Colors.white,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    color: Color(0xFF282829),
                    fontSize: 13,
                  ),
                  decoration: _fieldDecoration(
                    hint: _loadingCities
                        ? 'Carregando cidades...'
                        : 'Selecione sua cidade',
                    icon: Icons.apartment_outlined,
                  ),
                  hint: Text(
                    _loadingCities
                        ? 'Carregando cidades...'
                        : 'Selecione sua cidade',
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      color: _hint,
                      fontSize: 13,
                    ),
                  ),
                  items: _cities
                      .map(
                        (c) => DropdownMenuItem<String>(
                          value: c['name'] as String,
                          child: Text(c['name'] as String),
                        ),
                      )
                      .toList(),
                  onChanged: (_selectedUf == null || _loadingCities)
                      ? null
                      : (city) => setState(() => _selectedCity = city),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  style: _inputTextStyle,
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: _fieldDecoration(
                    hint: 'Digite sua senha',
                    icon: Icons.lock_outline_rounded,
                    suffix: IconButton(
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        color: _hint,
                        size: 22,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirmPassword,
                  style: _inputTextStyle,
                  obscureText: _obscureConfirm,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) {
                    if (_canSubmit) _submit();
                  },
                  decoration: _fieldDecoration(
                    hint: 'Confirme sua senha',
                    icon: Icons.lock_outline_rounded,
                    suffix: IconButton(
                      onPressed: () =>
                          setState(() => _obscureConfirm = !_obscureConfirm),
                      icon: Icon(
                        _obscureConfirm
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        color: _hint,
                        size: 22,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _canSubmit ? _submit : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          _canSubmit ? Colors.black : _disabledButton,
                      disabledBackgroundColor: _disabledButton,
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Criar Conta'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountTypeButton extends StatelessWidget {
  const _AccountTypeButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFF58634);
    const border = Color(0xFFD1D5DB);
    const muted = Color(0xFF6B7280);

    return SizedBox(
      height: 48,
      child: Material(
        color: selected ? accent : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selected ? accent : border,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 20,
                color: selected ? Colors.white : muted,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  color: selected ? Colors.white : muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
