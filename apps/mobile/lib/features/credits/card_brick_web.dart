// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:async';
import 'dart:html' as html;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'card_brick_host.dart';

CardBrickHost createPlatformCardBrickHost() => MercadoPagoCardBrickHost();

const _sdkUrl = 'https://sdk.mercadopago.com/js/v2';

Future<void>? _sdkLoad;

/// Loads MercadoPago.js V2 the first time a card form is opened.
Future<void> loadMercadoPagoSdk() {
  return _sdkLoad ??= _loadMercadoPagoSdk();
}

Future<void> _loadMercadoPagoSdk() async {
  if (globalContext['MercadoPago'] != null) return;
  final existing = html.document.querySelector('script[data-after-mp-sdk="v2"]');
  final script = existing is html.ScriptElement ? existing : html.ScriptElement()
    ..src = _sdkUrl
    ..async = true
    ..setAttribute('data-after-mp-sdk', 'v2');
  if (existing == null) {
    html.document.head?.append(script);
  }
  if (globalContext['MercadoPago'] != null) return;
  final loaded = script.onLoad.first;
  final failed = script.onError.first.then<void>((_) {
    throw StateError('Mercado Pago SDK failed to load');
  });
  await Future.any<void>([loaded, failed]);
  if (globalContext['MercadoPago'] == null) {
    throw StateError('Mercado Pago SDK missing');
  }
}

class MercadoPagoCardBrickHost implements CardBrickHost {
  final Map<int, html.DivElement> _elements = {};
  final Set<String> _registered = {};
  JSObject? _controller;
  int _generation = 0;

  @override
  bool get usesPlatformView => true;

  @override
  void registerView(String viewType) {
    if (!_registered.add(viewType)) return;
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int viewId) {
      final element = html.DivElement()
        ..id = 'after-card-brick-$viewId'
        ..style.width = '100%'
        ..style.height = '100%';
      _elements[viewId] = element;
      return element;
    });
  }

  @override
  Future<void> mount(CardBrickMountRequest request) async {
    final viewId = request.viewId;
    if (viewId == null) return;
    final generation = ++_generation;
    await loadMercadoPagoSdk();
    if (generation != _generation) return;
    final element = _elements[viewId];
    if (element == null) return;
    await _unmountController();
    if (generation != _generation) return;

    final ctor = globalContext['MercadoPago'];
    if (ctor == null || !ctor.isA<JSFunction>()) {
      request.onBrickError(
        'Não foi possível abrir o formulário seguro do cartão.',
      );
      return;
    }
    final options = JSObject()..['locale'] = 'pt-BR'.toJS;
    final mp = (ctor as JSFunction).callAsConstructor<JSObject>(
      request.publicKey.toJS,
      options,
    );
    final bricks = mp.callMethod<JSObject>('bricks'.toJS);
    final created = bricks.callMethod<JSPromise<JSObject>>(
      'create'.toJS,
      'cardPayment'.toJS,
      element.id.toJS,
      _settings(request),
    );
    final controller = await created.toDart;
    if (generation != _generation) {
      controller.callMethod('unmount'.toJS);
      return;
    }
    _controller = controller;
  }

  @override
  Future<void> unmount() async {
    _generation++;
    await _unmountController();
  }

  Future<void> _unmountController() async {
    final controller = _controller;
    _controller = null;
    if (controller == null) return;
    try {
      controller.callMethod('unmount'.toJS);
    } catch (_) {}
  }

  JSObject _settings(CardBrickMountRequest request) {
    final initialization = JSObject()..['amount'] = request.amount.toJS;
    final email = request.payerEmail?.trim() ?? '';
    if (email.isNotEmpty) {
      initialization['payer'] = JSObject()..['email'] = email.toJS;
    }
    final paymentMethods = JSObject()
      ..['maxInstallments'] = 1.toJS
      ..['types'] = (JSObject()
        ..['excluded'] = ['debit_card', 'prepaid_card'].jsify());
    final customization = JSObject()
      ..['paymentMethods'] = paymentMethods
      ..['visual'] = (JSObject()
        ..['style'] = (JSObject()
          ..['theme'] = 'default'.toJS
          ..['customVariables'] = (JSObject()
            ..['textPrimaryColor'] = '#282829'.toJS
            ..['textSecondaryColor'] = '#8A9391'.toJS
            ..['inputBackgroundColor'] = '#FFFFFF'.toJS
            ..['formBackgroundColor'] = '#FFFFFF'.toJS
            ..['baseColor'] = '#F58634'.toJS
            ..['outlinePrimaryColor'] = '#F58634'.toJS
            ..['buttonTextColor'] = '#FFFFFF'.toJS)));
    final callbacks = JSObject()
      ..['onReady'] = (() {}).toJS
      ..['onError'] = ((JSAny? _) {
        request.onBrickError(
          'Não foi possível validar o cartão no formulário seguro.',
        );
      }).toJS
      ..['onSubmit'] = ((JSAny? raw) {
        return _submit(request, raw);
      }).toJS;
    return JSObject()
      ..['initialization'] = initialization
      ..['customization'] = customization
      ..['callbacks'] = callbacks;
  }

  JSPromise<JSAny?> _submit(CardBrickMountRequest request, JSAny? raw) {
    return JSPromise<JSAny?>(
      (JSFunction resolve, JSFunction reject) {
        unawaited(() async {
          try {
            if (raw == null || !raw.isA<JSObject>()) {
              throw CardBrickUserException(
                'O formulário seguro não devolveu um pagamento utilizável.',
              );
            }
            final data = raw as JSObject;
            final token = _string(data, 'token');
            final method = _string(data, 'payment_method_id');
            if (token == null || method == null) {
              throw CardBrickUserException(
                'O formulário seguro não devolveu um pagamento utilizável.',
              );
            }
            final type = _string(data, 'payment_type_id') ?? 'credit_card';
            final installments = _int(data, 'installments') ?? 1;
            await request.onSubmit(
              CardBrickForm(
                token: token,
                paymentMethodId: method,
                paymentType: type,
                installments: installments,
              ),
            );
            resolve.callAsFunction(resolve, null);
          } on CardBrickUserException catch (error) {
            _rejectSubmit(reject, error.message);
          } catch (_) {
            _rejectSubmit(reject, 'Não foi possível concluir o pagamento.');
          }
        }());
      }.toJS,
    );
  }
}

void _rejectSubmit(JSFunction reject, String message) {
  final ctor = globalContext['Error'];
  if (ctor != null && ctor.isA<JSFunction>()) {
    final error = (ctor as JSFunction).callAsConstructor<JSObject>(message.toJS);
    reject.callAsFunction(reject, error);
    return;
  }
  reject.callAsFunction(reject, message.toJS);
}

String? _string(JSObject object, String key) {
  final value = object[key];
  if (value != null && value.isA<JSString>()) {
    final text = (value as JSString).toDart.trim();
    return text.isEmpty ? null : text;
  }
  return null;
}

int? _int(JSObject object, String key) {
  final value = object[key];
  if (value != null && value.isA<JSNumber>()) {
    return (value as JSNumber).toDartInt;
  }
  return null;
}
