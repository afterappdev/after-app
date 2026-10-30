import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../auth/auth_controller.dart';

/// Congela o estabelecimento ativo ao abrir um fluxo de pagamento.
mixin CheckoutVenuePin<T extends StatefulWidget> on State<T> {
  String? _pinnedCheckoutVenueId;
  bool _checkoutVenuePinned = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_checkoutVenuePinned) return;
    _checkoutVenuePinned = true;
    AuthController? auth;
    try {
      auth = context.read<AuthController>();
    } catch (_) {
      auth = null;
    }
    _pinnedCheckoutVenueId =
        auth?.managingVenueId ?? context.read<ApiClient>().activeVenueIdHeader;
  }

  String? get pinnedCheckoutVenueId => _pinnedCheckoutVenueId;

  Future<R> runForCheckoutVenue<R>(
    ApiClient api,
    Future<R> Function() action,
  ) {
    final pinned = _pinnedCheckoutVenueId;
    if (pinned == null || pinned.isEmpty) {
      return action();
    }
    return api.runWithActiveVenueHeader(pinned, action);
  }
}
