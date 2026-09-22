import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';

class BlockedVenuesScreen extends StatefulWidget {
  const BlockedVenuesScreen({super.key});

  @override
  State<BlockedVenuesScreen> createState() => _BlockedVenuesScreenState();
}

class _BlockedVenuesScreenState extends State<BlockedVenuesScreen> {
  static const _accent = Color(0xFFF58634);
  static const _muted = Color(0xFF8B8B96);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  final Set<String> _busy = {};

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
      final data =
          await context.read<ApiClient>().get('/users/me/blocked-venues');
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

  Future<void> _unblock(String venueId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Desbloquear estabelecimento?'),
        content: const Text(
          'Você voltará a ver este estabelecimento e seus conteúdos no After.',
        ),
        actions: [
          TextButton(
            key: const Key('unblock-cancel'),
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('unblock-confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Desbloquear'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    if (_busy.contains(venueId)) return;
    setState(() => _busy.add(venueId));
    try {
      await context.read<ApiClient>().delete(
            '/users/me/blocked-venues/$venueId',
          );
      if (!mounted) return;
      setState(() {
        _items.removeWhere(
          (item) => item['venueId']?.toString() == venueId ||
              (item['venue'] as Map?)?['id']?.toString() == venueId,
        );
        _busy.remove(venueId);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy.remove(venueId));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
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
          color: const Color(0xFF282829),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: _loading
              ? const Center(
                  child: CircularProgressIndicator(color: _accent),
                )
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              key: const Key('blocked-venues-error'),
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: _load,
                              child: const Text('Tentar novamente'),
                            ),
                          ],
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
                            'Estabelecimentos bloqueados',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w800,
                              fontSize: 22,
                              color: Color(0xFF282829),
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Você não verá estes locais nem os conteúdos deles no After.',
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
                                'Você não bloqueou nenhum estabelecimento.',
                                key: Key('blocked-venues-empty'),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  color: _muted,
                                ),
                              ),
                            )
                          else
                            ..._items.map((item) {
                              final venue = item['venue']
                                      as Map<String, dynamic>? ??
                                  {};
                              final id = venue['id']?.toString() ??
                                  item['venueId']?.toString() ??
                                  '';
                              final name =
                                  venue['name']?.toString() ?? 'Local';
                              final image = ApiConfig.resolveMediaUrl(
                                venue['logoUrl']?.toString() ??
                                    venue['coverUrl']?.toString(),
                              );
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Material(
                                  color: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    side: const BorderSide(
                                      color: Color(0xFFE8E8EE),
                                    ),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 12,
                                    ),
                                    child: Row(
                                      children: [
                                        CircleAvatar(
                                          radius: 24,
                                          backgroundColor:
                                              const Color(0xFFE8F0ED),
                                          backgroundImage: image.isEmpty
                                              ? null
                                              : NetworkImage(image),
                                          child: image.isEmpty
                                              ? const Icon(
                                                  Icons.storefront_outlined,
                                                  color: _accent,
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
                                        TextButton(
                                          key: Key('unblock-venue-$id'),
                                          onPressed: _busy.contains(id)
                                              ? null
                                              : () => _unblock(id),
                                          child: const Text('Desbloquear'),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            }),
                        ],
                      ),
                    ),
        ),
      ),
    );
  }
}
