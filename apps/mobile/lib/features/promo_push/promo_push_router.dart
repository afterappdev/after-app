import 'package:flutter/material.dart';

import '../../core/router/app_router.dart';
import 'promo_publication.dart';
import 'promo_push_api.dart';
import 'promo_push_message.dart';

class PromoPushRouter {
  PromoPushRouter({required this.navigatorKey, required this.api});

  final GlobalKey<NavigatorState> navigatorKey;
  final PromoPushApi api;
  bool _opening = false;

  Future<void> open(PromoPushMessage message) async {
    if (!message.canOpen || _opening) return;
    final navigator = navigatorKey.currentState;
    final context = navigatorKey.currentContext;
    if (navigator == null || context == null) return;
    if (_alreadyShowing(navigator, message)) return;
    _opening = true;
    try {
      final venue = await api.getVenue(message.venueId);
      if (!context.mounted) return;
      final status = promoPublicationStatus(
        venue: venue,
        bannerId: message.bannerId,
      );
      if (status == PromoPublicationStatus.unavailable) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(promoUnavailableMessage)),
        );
        return;
      }
      navigator.pushNamed(
        AppRoutes.venuePublic,
        arguments: {
          'venueId': message.venueId,
          'focusBannerId': message.bannerId,
        },
      );
    } finally {
      _opening = false;
    }
  }

  void reset() {}

  bool _alreadyShowing(NavigatorState navigator, PromoPushMessage message) {
    var showing = false;
    navigator.popUntil((route) {
      if (_sameBanner(route.settings.arguments, message)) showing = true;
      return true;
    });
    return showing;
  }

  bool _sameBanner(Object? arguments, PromoPushMessage message) {
    if (arguments is! Map) return false;
    return arguments['venueId']?.toString() == message.venueId &&
        arguments['focusBannerId']?.toString() == message.bannerId;
  }
}
