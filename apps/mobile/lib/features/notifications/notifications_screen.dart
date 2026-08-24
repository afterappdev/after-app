import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'notifications_controller.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFF6F8F7);
  static const _muted = Color(0xFF8B8B96);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

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
      final data = await context.read<ApiClient>().get('/notifications');
      if (!mounted) return;
      setState(() {
        _items = (data as List<dynamic>? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _loading = false;
      });
      await context.read<NotificationsController>().markAllRead();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _openVenue(Map<String, dynamic> item) async {
    final venue = item['venue'] as Map<String, dynamic>? ?? {};
    final id = venue['id']?.toString() ?? item['venueId']?.toString();
    if (id == null || id.isEmpty) return;
    final result = await Navigator.of(context).pushNamed(
      AppRoutes.venuePublic,
      arguments: {
        'venueId': id,
        'navIndex': 3,
      },
    );
    if (!mounted) return;
    if (result is int) {
      Navigator.of(context).pop(result);
    }
  }

  String _timeLabel(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    if (parsed == null) return '';
    final d = parsed.toLocal();
    final now = DateTime.now();
    final diff = now.difference(d);
    if (diff.inMinutes < 1) return 'agora';
    if (diff.inMinutes < 60) return 'há ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'há ${diff.inHours} h';
    if (diff.inDays < 7) return 'há ${diff.inDays} d';
    final day = d.day.toString().padLeft(2, '0');
    final month = d.month.toString().padLeft(2, '0');
    return '$day/$month';
  }

  @override
  Widget build(BuildContext context) {
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
          'Notificações',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 20,
            color: Color(0xFF282829),
          ),
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
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        children: [
                          if (_items.isEmpty)
                            const Padding(
                              padding: EdgeInsets.only(top: 80),
                              child: Text(
                                'Nenhuma notificação ainda.\nQuando um local favorito publicar, você vê aqui.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontSize: 14,
                                  color: _muted,
                                  height: 1.45,
                                ),
                              ),
                            )
                          else
                            ..._items.map((item) {
                              final venue =
                                  item['venue'] as Map<String, dynamic>? ?? {};
                              final unread = item['readAt'] == null;
                              final logo = ApiConfig.resolveMediaUrl(
                                venue['logoUrl']?.toString() ??
                                    venue['coverUrl']?.toString(),
                              );
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Material(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () => _openVenue(item),
                                    child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          CircleAvatar(
                                            radius: 22,
                                            backgroundColor:
                                                const Color(0xFFE8F0ED),
                                            backgroundImage: logo.isNotEmpty
                                                ? NetworkImage(logo)
                                                : null,
                                            child: logo.isEmpty
                                                ? const Icon(
                                                    Icons.storefront_outlined,
                                                    color: _accent,
                                                    size: 22,
                                                  )
                                                : null,
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  item['title']?.toString() ??
                                                      'Nova publicação',
                                                  style: TextStyle(
                                                    fontFamily:
                                                        AppTheme.fontFamily,
                                                    fontWeight: unread
                                                        ? FontWeight.w700
                                                        : FontWeight.w600,
                                                    fontSize: 14,
                                                    color:
                                                        const Color(0xFF282829),
                                                  ),
                                                ),
                                                if ((item['body']
                                                            ?.toString() ??
                                                        '')
                                                    .isNotEmpty) ...[
                                                  const SizedBox(height: 4),
                                                  Text(
                                                    item['body'].toString(),
                                                    style: const TextStyle(
                                                      fontFamily:
                                                          AppTheme.fontFamily,
                                                      fontSize: 13,
                                                      color: _muted,
                                                    ),
                                                  ),
                                                ],
                                                const SizedBox(height: 6),
                                                Text(
                                                  _timeLabel(item['createdAt']),
                                                  style: const TextStyle(
                                                    fontFamily:
                                                        AppTheme.fontFamily,
                                                    fontSize: 11,
                                                    color: Color(0xFFB0B0B8),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          if (unread)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              margin: const EdgeInsets.only(
                                                top: 6,
                                                left: 8,
                                              ),
                                              decoration: const BoxDecoration(
                                                color: _accent,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
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
