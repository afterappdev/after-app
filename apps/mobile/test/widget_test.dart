import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/widgets/after_logo.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/intro/after_intro_screen.dart';
import 'package:after_app/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App starts on intro then login when unauthenticated', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient();
    final auth = AuthController(api: api, storage: AuthStorage());
    await auth.bootstrap();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: AfterApp(auth: auth),
      ),
    );

    expect(find.byType(AfterIntroScreen), findsOneWidget);
    expect(find.byType(AfterLogo), findsOneWidget);
    expect(find.image(const AssetImage(AfterLogo.assetPath)), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 5000));
    await tester.pumpAndSettle();

    expect(find.text('Entrar'), findsWidgets);
  });
}
