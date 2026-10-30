import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import '../auth/models/owned_venue_summary.dart';

/// Seletor de estabelecimento ativo (contas VENUE com 2+ locais).
class VenueActiveSelector extends StatelessWidget {
  const VenueActiveSelector({super.key});

  static const _orange = Color(0xFFF58634);
  static const _purple = AppTheme.accentPurple;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (!auth.showVenueSwitcher) return const SizedBox.shrink();

    final activeId = auth.managingVenueId;
    final venues = auth.user!.venues;
    OwnedVenueSummary? active;
    for (final venue in venues) {
      if (venue.id == activeId) {
        active = venue;
        break;
      }
    }
    active ??= venues.isNotEmpty ? venues.first : null;
    if (active == null) return const SizedBox.shrink();

    final logo = ApiConfig.resolveMediaUrl(active.logoUrl);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        elevation: 0,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: auth.switchingActiveVenue
              ? null
              : () => _openSheet(context, auth),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _purple.withValues(alpha: 0.35)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: const Color(0xFFE8F0ED),
                  backgroundImage:
                      logo.isEmpty ? null : NetworkImage(logo),
                  child: logo.isEmpty
                      ? const Icon(Icons.storefront, color: _orange, size: 24)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Estabelecimento ativo',
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _purple.withValues(alpha: 0.85),
                          letterSpacing: 0.3,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        active.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: AppTheme.ink,
                        ),
                      ),
                      Text(
                        '${active.city} · ${active.state}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 12,
                          color: AppTheme.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (auth.switchingActiveVenue)
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: _orange,
                    ),
                  )
                else
                  Icon(Icons.unfold_more_rounded, color: _purple.withValues(alpha: 0.9)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openSheet(
    BuildContext context,
    AuthController auth,
  ) async {
    final venues = auth.user!.venues;
    if (venues.length < 2) return;

    final messenger = ScaffoldMessenger.maybeOf(context);

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (modalContext) {
        return _VenuePickerSheet(
          auth: auth,
          venues: venues,
          scaffoldMessenger: messenger,
        );
      },
    );
  }
}

/// Conteúdo do modal: [State] persistente para sobreviver a notifyListeners do [AuthController].
class _VenuePickerSheet extends StatefulWidget {
  const _VenuePickerSheet({
    required this.auth,
    required this.venues,
    required this.scaffoldMessenger,
  });

  final AuthController auth;
  final List<OwnedVenueSummary> venues;
  final ScaffoldMessengerState? scaffoldMessenger;

  @override
  State<_VenuePickerSheet> createState() => _VenuePickerSheetState();
}

class _VenuePickerSheetState extends State<_VenuePickerSheet> {
  NavigatorState? _modalNavigator;
  String? _pendingVenueId;

  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_onAuthChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _modalNavigator ??= Navigator.of(context);
  }

  @override
  void dispose() {
    widget.auth.removeListener(_onAuthChanged);
    super.dispose();
  }

  void _onAuthChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _dismissModal() {
    final nav = _modalNavigator;
    if (nav != null && nav.mounted) {
      nav.pop();
    }
  }

  Future<void> _onVenueSelected(OwnedVenueSummary venue) async {
    if (widget.auth.switchingActiveVenue) return;

    final currentActive = widget.auth.managingVenueId;
    if (venue.id == currentActive) {
      _dismissModal();
      return;
    }

    final nav = _modalNavigator;
    setState(() => _pendingVenueId = venue.id);

    final err = await widget.auth.switchActiveVenue(venue.id);

    if (!mounted) {
      if (err == null && nav != null && nav.mounted) {
        nav.pop();
      }
      return;
    }

    setState(() => _pendingVenueId = null);

    if (err != null) {
      widget.scaffoldMessenger?.showSnackBar(SnackBar(content: Text(err)));
      return;
    }

    _dismissModal();
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    final activeId = auth.managingVenueId;
    final switching = auth.switchingActiveVenue;
    final venues = widget.venues;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE0E0E6),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Seus estabelecimentos',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: AppTheme.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Créditos, banners e cupons usam o local selecionado.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 13,
                color: AppTheme.muted.withValues(alpha: 0.95),
              ),
            ),
            if (switching) ...[
              const SizedBox(height: 12),
              const LinearProgressIndicator(
                minHeight: 2,
                color: Color(0xFFF58634),
                backgroundColor: Color(0xFFE8E8EE),
              ),
            ],
            const SizedBox(height: 16),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: venues.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, index) {
                  final venue = venues[index];
                  final selected = venue.id == activeId;
                  final pending = _pendingVenueId == venue.id && switching;
                  return _VenueTile(
                    venue: venue,
                    selected: selected,
                    pending: pending,
                    enabled: !switching,
                    onTap: switching
                        ? null
                        : () => _onVenueSelected(venue),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VenueTile extends StatelessWidget {
  const _VenueTile({
    required this.venue,
    required this.selected,
    required this.onTap,
    this.enabled = true,
    this.pending = false,
  });

  final OwnedVenueSummary venue;
  final bool selected;
  final bool pending;
  final VoidCallback? onTap;
  final bool enabled;

  static const _orange = Color(0xFFF58634);
  static const _purple = AppTheme.accentPurple;

  @override
  Widget build(BuildContext context) {
    final logo = ApiConfig.resolveMediaUrl(venue.logoUrl);
    return Material(
      color: selected ? _purple.withValues(alpha: 0.08) : const Color(0xFFF9FAFA),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled ? onTap : null,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? _purple : const Color(0xFFE8E8EE),
              width: selected ? 2 : 1,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: const Color(0xFFE8F0ED),
                backgroundImage: logo.isEmpty ? null : NetworkImage(logo),
                child: logo.isEmpty
                    ? const Icon(Icons.storefront, color: _orange, size: 22)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      venue.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: AppTheme.ink,
                      ),
                    ),
                    Text(
                      '${venue.city} · ${venue.state}',
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 12,
                        color: AppTheme.muted,
                      ),
                    ),
                  ],
                ),
              ),
              if (pending)
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: _orange,
                  ),
                )
              else if (selected)
                const Icon(Icons.check_circle, color: _purple, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}
