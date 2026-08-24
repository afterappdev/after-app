import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFFFFFFF);
  static const _muted = Color(0xFF8B8B96);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  final Set<String> _removing = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await context.read<ApiClient>().get('/favorites');
      if (!mounted) return;
      setState(() {
        _items = (data as List<dynamic>? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _unfavorite(String venueId) async {
    if (_removing.contains(venueId)) return;
    final index = _items.indexWhere((item) {
      final venue = item['venue'] as Map<String, dynamic>? ?? {};
      return venue['id']?.toString() == venueId;
    });
    if (index < 0) return;
    final removed = _items[index];
    setState(() {
      _removing.add(venueId);
      _items.removeAt(index);
    });
    try {
      await context.read<ApiClient>().delete('/favorites/$venueId');
      if (!mounted) return;
      setState(() => _removing.remove(venueId));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _items.insert(index.clamp(0, _items.length), removed);
        _removing.remove(venueId);
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _openVenue(String? id) async {
    if (id == null || id.isEmpty) return;
    final result = await Navigator.of(context).pushNamed(
      AppRoutes.venuePublic,
      arguments: {
        'venueId': id,
        'navIndex': 2,
      },
    );
    if (!mounted) return;
    if (result is int && result != 2) {
      Navigator.of(context).pop(result);
    }
  }

  void _onNavTap(int index) {
    if (index == 2) return;
    Navigator.of(context).pop(index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: const Color(0xFF282829),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Column(
            children: [
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(color: _accent),
                      )
                    : _error != null
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                ),
                              ),
                            ),
                          )
                        : RefreshIndicator(
                            color: _accent,
                            onRefresh: _load,
                            child: ListView(
                              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                              children: [
                                const Text(
                                  'Meus Favoritos',
                                  style: TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 22,
                                    color: Color(0xFF282829),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Seus lugares favoritos em um só lugar.',
                                  style: TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontSize: 13,
                                    color: _muted,
                                  ),
                                ),
                                const SizedBox(height: 22),
                                if (_items.isEmpty)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 48),
                                    child: Text(
                                      'Nenhum favorito ainda.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        color: _muted,
                                      ),
                                    ),
                                  )
                                else
                                  ...List.generate(_items.length, (index) {
                                    final fav = _items[index];
                                    final venue = fav['venue']
                                            as Map<String, dynamic>? ??
                                        {};
                                    final id = venue['id']?.toString() ?? '';
                                    return Padding(
                                      padding: const EdgeInsets.only(bottom: 12),
                                      child: _FavoriteCard(
                                        name: venue['name']?.toString() ?? 'Local',
                                        imageUrl: ApiConfig.resolveMediaUrl(
                                          venue['logoUrl']?.toString() ??
                                              venue['coverUrl']?.toString(),
                                        ),
                                        highlighted: index == 0,
                                        onOpen: () => _openVenue(id),
                                        onUnfavorite: () => _unfavorite(id),
                                      ),
                                    );
                                  }),
                              ],
                            ),
                          ),
              ),
              AfterBottomNav(
                index: 2,
                onTap: _onNavTap,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FavoriteCard extends StatelessWidget {
  const _FavoriteCard({
    required this.name,
    required this.imageUrl,
    required this.highlighted,
    required this.onOpen,
    required this.onUnfavorite,
  });

  final String name;
  final String imageUrl;
  final bool highlighted;
  final VoidCallback onOpen;
  final VoidCallback onUnfavorite;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlighted ? const Color(0xFFF4EFFC) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: highlighted
            ? BorderSide.none
            : const BorderSide(color: Color(0xFFE8E8EE)),
      ),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: const Color(0xFFE8F0ED),
                backgroundImage:
                    imageUrl.isEmpty ? null : NetworkImage(imageUrl),
                child: imageUrl.isEmpty
                    ? const Icon(
                        Icons.storefront_outlined,
                        color: Color(0xFFF58634),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: Color(0xFF282829),
                  ),
                ),
              ),
              IconButton(
                onPressed: onUnfavorite,
                icon: const Icon(Icons.favorite, color: Color(0xFFF58634)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

