import 'package:firebase_core/firebase_core.dart';

/// Optional Firebase options via `--dart-define`.
/// If empty, native `google-services.json` / `GoogleService-Info.plist` are used when present.
FirebaseOptions? firebaseOptionsFromEnvironment() {
  const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  const appId = String.fromEnvironment('FIREBASE_APP_ID');
  const senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  const iosBundleId = String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'com.r2p.after.afterAdmin',
  );
  if (apiKey.isEmpty ||
      appId.isEmpty ||
      senderId.isEmpty ||
      projectId.isEmpty) {
    return null;
  }
  return FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: senderId,
    projectId: projectId,
    iosBundleId: iosBundleId.isEmpty ? null : iosBundleId,
  );
}
