import 'dart:js_interop';

@JS('Notification')
extension type _BrowserNotification._(JSObject _) implements JSObject {
  external factory _BrowserNotification(
    String title, [
    _BrowserNotificationOptions? options,
  ]);
  external static String get permission;
  external static JSPromise<JSString> requestPermission();
}

@JS()
@anonymous
extension type _BrowserNotificationOptions._(JSObject _) implements JSObject {
  external factory _BrowserNotificationOptions({String body});
}

Future<void> requestPushPermission() async {
  try {
    if (_BrowserNotification.permission == 'granted') return;
    await _BrowserNotification.requestPermission().toDart;
  } catch (_) {}
}

Future<void> showPushNotification({
  required String title,
  required String body,
}) async {
  try {
    if (_BrowserNotification.permission != 'granted') return;
    _BrowserNotification(title, _BrowserNotificationOptions(body: body));
  } catch (_) {}
}
