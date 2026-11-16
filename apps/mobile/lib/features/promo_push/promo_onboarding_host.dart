import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'promo_onboarding_dialog.dart';
import 'promo_push_coordinator.dart';

/// Shows the one-shot legacy activation dialog when the coordinator asks.
class PromoOnboardingHost extends StatefulWidget {
  const PromoOnboardingHost({super.key, required this.child});

  final Widget child;

  @override
  State<PromoOnboardingHost> createState() => _PromoOnboardingHostState();
}

class _PromoOnboardingHostState extends State<PromoOnboardingHost> {
  bool _presenting = false;
  PromoPushCoordinator? _promo;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = context.read<PromoPushCoordinator>();
    if (!identical(_promo, next)) {
      _promo?.removeListener(_schedulePresent);
      _promo = next;
      _promo?.addListener(_schedulePresent);
    }
    _schedulePresent();
  }

  @override
  void dispose() {
    _promo?.removeListener(_schedulePresent);
    super.dispose();
  }

  void _schedulePresent() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_maybePresent());
    });
  }

  Future<void> _maybePresent() async {
    if (!mounted || _presenting) return;
    final promo = _promo;
    if (promo == null || !promo.shouldShowLegacyActivationOffer) return;
    _presenting = true;
    final accept = await showPromoLegacyActivationDialog(context);
    if (!mounted) {
      _presenting = false;
      return;
    }
    await promo.respondToLegacyActivationOffer(accept == true);
    _presenting = false;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}