import 'package:flutter/material.dart';

import 'card_brick_host.dart';

class CardBrickView extends StatefulWidget {
  const CardBrickView({
    super.key,
    required this.host,
    required this.viewType,
    required this.publicKey,
    required this.amount,
    required this.onSubmit,
    required this.onBrickError,
    this.payerEmail,
    this.usePlatformView = false,
  });

  final CardBrickHost host;
  final String viewType;
  final String publicKey;
  final double amount;
  final String? payerEmail;
  final Future<void> Function(CardBrickForm form) onSubmit;
  final void Function(String message) onBrickError;
  final bool usePlatformView;

  @override
  State<CardBrickView> createState() => _CardBrickViewState();
}

class _CardBrickViewState extends State<CardBrickView> {
  late Future<void> Function(CardBrickForm form) _onSubmit;
  var _mountedHost = false;

  @override
  void initState() {
    super.initState();
    _onSubmit = widget.onSubmit;
    if (widget.usePlatformView) {
      widget.host.registerView(widget.viewType);
      return;
    }
    _mountedHost = true;
    widget.host.mount(_request());
  }

  @override
  void didUpdateWidget(CardBrickView oldWidget) {
    super.didUpdateWidget(oldWidget);
    _onSubmit = widget.onSubmit;
  }

  @override
  void dispose() {
    if (_mountedHost || widget.usePlatformView) {
      widget.host.unmount();
    }
    super.dispose();
  }

  CardBrickMountRequest _request({int? viewId}) {
    return CardBrickMountRequest(
      viewType: widget.viewType,
      viewId: viewId,
      publicKey: widget.publicKey,
      amount: widget.amount,
      payerEmail: widget.payerEmail,
      onSubmit: (form) => _onSubmit(form),
      onBrickError: widget.onBrickError,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.usePlatformView) {
      return const SizedBox(
        key: Key('card-brick-slot'),
        width: double.infinity,
        child: Text(
          'Os dados do cartão ficam no formulário seguro do Mercado Pago.',
          key: Key('card-brick-placeholder'),
        ),
      );
    }
    return SizedBox(
      key: const Key('card-brick-slot'),
      height: 560,
      width: double.infinity,
      child: HtmlElementView(
        viewType: widget.viewType,
        onPlatformViewCreated: (viewId) {
          _mountedHost = true;
          widget.host.mount(_request(viewId: viewId));
        },
      ),
    );
  }
}
