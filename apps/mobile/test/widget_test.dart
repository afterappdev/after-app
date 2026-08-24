import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/widgets/after_logo.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/main.dart';

void main() {
  testWidgets('App starts on login when unauthenticated', (tester) async {
    final api = ApiClient();
    final auth = AuthController(api: api, storage: AuthStorage());

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: const AfterApp(),
      ),
    );

    expect(find.byType(AfterLogo), findsOneWidget);
    expect(find.image(const AssetImage(AfterLogo.assetPath)), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
  });
}
