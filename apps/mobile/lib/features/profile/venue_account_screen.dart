import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';
import '../auth/auth_controller.dart';

class VenueAccountScreen extends StatefulWidget {
  const VenueAccountScreen({super.key});

  @override
  State<VenueAccountScreen> createState() => _VenueAccountScreenState();
}

class _VenueAccountScreenState extends State<VenueAccountScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFF6F8F7);
  static const _muted = Color(0xFF8B8B96);

  Map<String, dynamic>? _venue;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadVenue();
  }

  Future<void> _loadVenue() async {
    final venueId = context.read<AuthController>().user?.venueId;
    if (venueId == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final data =
          await context.read<ApiClient>().get('/venues/$venueId') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _venue = data;
        _loading = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _onNavTap(int index) async {
    if (index == 3) return;
    if (index == 2) {
      final result = await Navigator.of(context).pushNamed(AppRoutes.credits);
      if (!mounted) return;
      if (result is int && result != 2 && result != 3) {
        Navigator.of(context).pop(result);
      }
      return;
    }
    Navigator.of(context).pop(index);
  }

  Future<void> _openPublicPage() async {
    final id = context.read<AuthController>().user?.venueId;
    if (id == null) return;
    final result = await Navigator.of(context).pushNamed(
      AppRoutes.venuePublic,
      arguments: {
        'venueId': id,
        'navIndex': 3,
      },
    );
    if (!mounted) return;
    if (result is int && result != 3) {
      await _onNavTap(result);
      return;
    }
    await _loadVenue();
  }

  Future<void> _openEdit() async {
    await Navigator.of(context).pushNamed(AppRoutes.venueEdit);
    if (mounted) await _loadVenue();
  }

  Future<void> _logout() async {
    await context.read<AuthController>().logout();
    if (!mounted) return;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    if (user != null && !user.isVenue) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        Navigator.of(context).pushReplacementNamed(AppRoutes.userProfile);
      });
    }

    final venueName = _venue?['name']?.toString() ?? user?.name ?? 'Estabelecimento';
    final category = _venue?['category']?.toString() ?? '';
    final logo = ApiConfig.resolveMediaUrl(_venue?['logoUrl']?.toString());

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
          'Perfil do local',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 20,
            color: Color(0xFF282829),
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _accent))
          : Center(
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
                              CircleAvatar(
                                radius: 40,
                                backgroundColor: const Color(0xFFE8F0ED),
                                backgroundImage:
                                    logo.isEmpty ? null : NetworkImage(logo),
                                child: logo.isEmpty
                                    ? const Icon(
                                        Icons.storefront,
                                        size: 36,
                                        color: _accent,
                                      )
                                    : null,
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      venueName,
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
                                      category.isNotEmpty
                                          ? category
                                          : (user?.email ?? ''),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 13,
                                        color: _muted,
                                      ),
                                    ),
                                    if (category.isNotEmpty &&
                                        (user?.email ?? '').isNotEmpty) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        user!.email,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontFamily: AppTheme.fontFamily,
                                          fontSize: 12,
                                          color: _muted,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 28),
                          const _SectionLabel('GERENCIAR'),
                          const SizedBox(height: 8),
                          _InfoCard(
                            children: [
                              _AccountRow(
                                icon: Icons.visibility_outlined,
                                label: 'Ver página do local',
                                value: 'Como o público vê seu perfil',
                                valueIsHint: true,
                                onTap: _openPublicPage,
                              ),
                              const _RowDivider(),
                              _AccountRow(
                                icon: Icons.edit_outlined,
                                label: 'Editar perfil do local',
                                value: 'Mídia, horários e contatos',
                                valueIsHint: true,
                                onTap: _openEdit,
                              ),
                              const _RowDivider(),
                              _AccountRow(
                                icon: Icons.campaign_outlined,
                                label: 'Créditos e banners',
                                value: 'Publique promoções do dia',
                                valueIsHint: true,
                                onTap: () => Navigator.of(context)
                                    .pushNamed(AppRoutes.credits),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _logout,
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

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.value,
    this.valueIsHint = false,
  });

  final IconData icon;
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
            Icon(icon, color: const Color(0xFFF58634), size: 22),
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
