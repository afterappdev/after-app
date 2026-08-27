import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';
import '../auth/auth_controller.dart';
import '../notifications/notifications_controller.dart';
import '../notifications/push_notifications.dart';
import 'delete_account_button.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFF6F8F7);
  static const _muted = Color(0xFF8B8B96);

  late final TextEditingController _name;
  String? _selectedUf;
  String? _selectedCity;
  List<Map<String, dynamic>> _states = [];
  List<Map<String, dynamic>> _cities = [];
  bool _loadingCities = false;
  bool _saving = false;
  bool _uploadingPhoto = false;
  String? _avatarUrl;
  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthController>().user;
    _name = TextEditingController(text: user?.name ?? '');
    _selectedUf = user?.state;
    _selectedCity = user?.city;
    _avatarUrl = user?.avatarUrl;
    _loadStates();
    if (_selectedUf != null && _selectedUf!.isNotEmpty) {
      _loadCities(_selectedUf!, keepCity: true);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<NotificationsController>().refresh();
    });
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _hasChanges {
    final user = context.read<AuthController>().user;
    if (user == null) return false;
    return _name.text.trim() != user.name ||
        (_selectedUf ?? '') != user.state ||
        (_selectedCity ?? '') != user.city ||
        (_avatarUrl ?? '') != (user.avatarUrl ?? '');
  }

  String _stateLabel(String? uf) {
    if (uf == null || uf.isEmpty) return 'Selecione';
    for (final s in _states) {
      if (s['uf'] == uf) {
        return s['name']?.toString() ?? uf;
      }
    }
    return uf;
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _choosePhotoSource() async {
    final source = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: _accent),
                title: const Text(
                  'Escolher da galeria',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF282829),
                  ),
                ),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined, color: _accent),
                title: const Text(
                  'Tirar foto',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF282829),
                  ),
                ),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              if (_avatarUrl != null && _avatarUrl!.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: Color(0xFFE53935)),
                  title: const Text(
                    'Remover foto',
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF282829),
                    ),
                  ),
                  onTap: () => Navigator.pop(ctx, 'remove'),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (source == 'remove') {
      setState(() => _avatarUrl = null);
      return;
    }
    if (source is ImageSource) {
      await _pickPhoto(source);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final file = await _picker.pickImage(
        source: source,
        maxWidth: 1200,
        imageQuality: 85,
      );
      if (file == null || !mounted) return;
      setState(() => _uploadingPhoto = true);
      final api = context.read<ApiClient>();
      final bytes = await file.readAsBytes();
      final uploaded = await api.uploadImage(
        bytes: bytes,
        filename: file.name,
        mimeType: file.mimeType,
      );
      if (!mounted) return;
      setState(() {
        _avatarUrl = uploaded['url'] as String?;
        _uploadingPhoto = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _uploadingPhoto = false);
      _showSnack(e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploadingPhoto = false);
      _showSnack(
        source == ImageSource.camera
            ? 'Não foi possível abrir a câmera.'
            : 'Não foi possível abrir a galeria.',
      );
    }
  }

  Future<void> _loadStates() async {
    try {
      final api = context.read<ApiClient>();
      final data = await api.get('/locations/states') as List<dynamic>;
      if (!mounted) return;
      setState(() {
        _states = data.cast<Map<String, dynamic>>();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      _showSnack(e.message);
    }
  }

  Future<void> _loadCities(String uf, {bool keepCity = false}) async {
    setState(() {
      _loadingCities = true;
      if (!keepCity) _selectedCity = null;
      _cities = [];
    });
    try {
      final api = context.read<ApiClient>();
      final data =
          await api.get('/locations/states/$uf/cities') as List<dynamic>;
      if (!mounted) return;
      setState(() {
        _cities = data.cast<Map<String, dynamic>>();
        _loadingCities = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loadingCities = false);
      _showSnack(e.message);
    }
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.length < 2) {
      _showSnack('Preencha o nome.');
      return;
    }
    if (_selectedUf == null || _selectedCity == null) {
      _showSnack('Selecione o estado e a cidade.');
      return;
    }
    setState(() => _saving = true);
    try {
      await context.read<AuthController>().updateProfile(
            name: name,
            state: _selectedUf!,
            city: _selectedCity!,
            avatarUrl: _avatarUrl,
          );
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (!mounted) return;
      _showSnack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editName() async {
    final controller = TextEditingController(text: _name.text);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text(
            'Nome',
            style: TextStyle(fontFamily: AppTheme.fontFamily),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            style: const TextStyle(fontFamily: AppTheme.fontFamily, fontSize: 14),
            decoration: const InputDecoration(hintText: 'Seu nome'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
    controller.dispose();
    if (result != null && result.isNotEmpty) {
      setState(() => _name.text = result);
    }
  }

  Future<void> _pickState() async {
    if (_states.isEmpty) await _loadStates();
    if (!mounted) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return ListView.builder(
          itemCount: _states.length,
          itemBuilder: (_, index) {
            final item = _states[index];
            final uf = item['uf']?.toString() ?? '';
            final name = item['name']?.toString() ?? uf;
            return ListTile(
              title: Text(
                name,
                style: const TextStyle(fontFamily: AppTheme.fontFamily),
              ),
              trailing: uf == _selectedUf
                  ? const Icon(Icons.check, color: _accent)
                  : null,
              onTap: () => Navigator.pop(ctx, uf),
            );
          },
        );
      },
    );
    if (selected == null || selected == _selectedUf) return;
    setState(() => _selectedUf = selected);
    await _loadCities(selected);
  }

  Future<void> _pickCity() async {
    if (_selectedUf == null) {
      _showSnack('Selecione o estado primeiro.');
      return;
    }
    if (_cities.isEmpty && !_loadingCities) {
      await _loadCities(_selectedUf!, keepCity: true);
    }
    if (!mounted) return;
    if (_loadingCities) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return ListView.builder(
          itemCount: _cities.length,
          itemBuilder: (_, index) {
            final name = _cities[index]['name']?.toString() ?? '';
            return ListTile(
              title: Text(
                name,
                style: const TextStyle(fontFamily: AppTheme.fontFamily),
              ),
              trailing: name == _selectedCity
                  ? const Icon(Icons.check, color: _accent)
                  : null,
              onTap: () => Navigator.pop(ctx, name),
            );
          },
        );
      },
    );
    if (selected == null) return;
    setState(() => _selectedCity = selected);
  }

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final confirm = TextEditingController();
    var obscure = true;

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: const Text(
                'Alterar senha',
                style: TextStyle(fontFamily: AppTheme.fontFamily),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: current,
                    obscureText: obscure,
                    decoration: const InputDecoration(hintText: 'Senha atual'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: next,
                    obscureText: obscure,
                    decoration: const InputDecoration(hintText: 'Nova senha'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: confirm,
                    obscureText: obscure,
                    decoration:
                        const InputDecoration(hintText: 'Confirme a nova senha'),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () =>
                      setDialogState(() => obscure = !obscure),
                  child: Text(obscure ? 'Mostrar' : 'Ocultar'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
                TextButton(
                  onPressed: () async {
                    if (next.text.length < 6) {
                      _showSnack(
                        'A senha deverá conter no mínimo 6 caracteres.',
                      );
                      return;
                    }
                    if (next.text != confirm.text) {
                      _showSnack('As senhas não coincidem.');
                      return;
                    }
                    try {
                      await context.read<AuthController>().changePassword(
                            currentPassword: current.text,
                            newPassword: next.text,
                          );
                      if (!ctx.mounted) return;
                      Navigator.pop(ctx);
                      _showSnack('Senha alterada.');
                    } on ApiException catch (e) {
                      _showSnack(e.message);
                    }
                  },
                  child: const Text('Salvar'),
                ),
              ],
            );
          },
        );
      },
    );
    current.dispose();
    next.dispose();
    confirm.dispose();
  }

  Future<void> _onNavTap(int index) async {
    if (index == 3) return;
    if (index == 2) {
      final result = await Navigator.of(context).pushNamed(AppRoutes.favorites);
      if (!mounted) return;
      if (result is int && result != 2 && result != 3) {
        Navigator.of(context).pop(result);
      }
      return;
    }
    Navigator.of(context).pop(index);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    if (user?.isVenue == true) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        Navigator.of(context).pushReplacementNamed(AppRoutes.venueAccount);
      });
    }

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: const Color(0xFF282829),
        ),
        title: const Text(
          'Seu Perfil',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 20,
            color: Color(0xFF282829),
          ),
        ),
        actions: [
          Consumer<NotificationsController>(
            builder: (context, inbox, _) {
              return IconButton(
                tooltip: 'Notificações',
                onPressed: () async {
                  await requestPushPermission();
                  if (!context.mounted) return;
                  final result = await Navigator.of(context)
                      .pushNamed(AppRoutes.notifications);
                  if (!context.mounted) return;
                  inbox.refresh();
                  if (result is int && result != 3) {
                    Navigator.of(context).pop(result);
                  }
                },
                icon: Badge(
                  isLabelVisible: inbox.unreadCount > 0,
                  backgroundColor: _accent,
                  smallSize: 8,
                  child: const Icon(
                    Icons.notifications_none_rounded,
                    color: Color(0xFF282829),
                    size: 26,
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  children: [
                    Row(
                      children: [
                        GestureDetector(
                          onTap: _uploadingPhoto ? null : _choosePhotoSource,
                          child: Stack(
                            children: [
                              CircleAvatar(
                                radius: 40,
                                backgroundColor: const Color(0xFFE8F0ED),
                                backgroundImage: (_avatarUrl != null &&
                                        _avatarUrl!.isNotEmpty)
                                    ? NetworkImage(
                                        ApiConfig.resolveMediaUrl(_avatarUrl),
                                      )
                                    : null,
                                child: _uploadingPhoto
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.2,
                                          color: _accent,
                                        ),
                                      )
                                    : (_avatarUrl == null || _avatarUrl!.isEmpty)
                                        ? const Icon(
                                            Icons.person,
                                            size: 42,
                                            color: _accent,
                                          )
                                        : null,
                              ),
                              Positioned(
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  width: 26,
                                  height: 26,
                                  decoration: BoxDecoration(
                                    color: _accent,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: Colors.white,
                                      width: 2,
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.camera_alt_rounded,
                                    size: 14,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _name.text.trim().isEmpty
                                    ? (user?.name ?? 'Usuário')
                                    : _name.text.trim(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                  color: Color(0xFF282829),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                user?.email ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontSize: 13,
                                  color: _muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    const _SectionLabel('INFORMAÇÕES PESSOAIS'),
                    const SizedBox(height: 8),
                    _InfoCard(
                      children: [
                        _ProfileRow(
                          icon: Icons.person_outline_rounded,
                          label: 'Nome',
                          value: _name.text.trim().isEmpty
                              ? 'Seu nome'
                              : _name.text.trim(),
                          onTap: _editName,
                        ),
                        const _RowDivider(),
                        _ProfileRow(
                          icon: Icons.location_on_outlined,
                          label: 'Estado',
                          value: _stateLabel(_selectedUf),
                          onTap: _pickState,
                        ),
                        const _RowDivider(),
                        _ProfileRow(
                          icon: Icons.apartment_outlined,
                          label: 'Cidade',
                          value: _loadingCities
                              ? 'Carregando...'
                              : (_selectedCity ?? 'Selecione sua cidade'),
                          onTap: _pickCity,
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    const _SectionLabel('MINHA CONTA'),
                    const SizedBox(height: 8),
                    _InfoCard(
                      children: [
                        _ProfileRow(
                          icon: Icons.favorite,
                          iconColor: const Color(0xFFE53935),
                          label: 'Meus favoritos',
                          onTap: () => _onNavTap(2),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    const _SectionLabel('SEGURANÇA'),
                    const SizedBox(height: 8),
                    _InfoCard(
                      children: [
                        _ProfileRow(
                          icon: Icons.lock_outline_rounded,
                          label: 'Alterar senha',
                          value: 'Mantenha sua conta segura',
                          valueIsHint: true,
                          onTap: _changePassword,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                child: SizedBox(
                  height: 52,
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: (_hasChanges && !_saving) ? _save : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      disabledBackgroundColor: const Color(0xFFBDBDBD),
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    child: _saving
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Salvar alterações'),
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () async {
                  await context.read<AuthController>().logout();
                  if (!context.mounted) return;
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                icon: const Icon(Icons.logout_rounded, color: _muted),
                label: const Text(
                  'Logout',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: _muted,
                  ),
                ),
              ),
              const DeleteAccountButton(),
              const SizedBox(height: 8),
              AfterBottomNav(
                index: 3,
                onTap: _onNavTap,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
        color: Color(0xFF9A9AA3),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 2,
      shadowColor: Colors.black12,
      borderRadius: BorderRadius.circular(16),
      child: Column(children: children),
    );
  }
}

class _RowDivider extends StatelessWidget {
  const _RowDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(height: 1, indent: 56, color: Color(0xFFF0F0F3));
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.value,
    this.valueIsHint = false,
    this.iconColor = const Color(0xFFF58634),
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String? value;
  final bool valueIsHint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: iconColor, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: value == null
                  ? Text(
                      label,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: Color(0xFF282829),
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: valueIsHint
                                ? FontWeight.w700
                                : FontWeight.w500,
                            fontSize: valueIsHint ? 14 : 12,
                            color: valueIsHint
                                ? const Color(0xFF282829)
                                : const Color(0xFF9A9AA3),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          value!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: valueIsHint
                                ? FontWeight.w400
                                : FontWeight.w700,
                            fontSize: valueIsHint ? 12 : 14,
                            color: valueIsHint
                                ? const Color(0xFF8B8B96)
                                : const Color(0xFF282829),
                          ),
                        ),
                      ],
                    ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFFB0B0B8),
            ),
          ],
        ),
      ),
    );
  }
}
