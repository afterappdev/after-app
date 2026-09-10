import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'core/network/api_client.dart';
import 'core/push/admin_push_coordinator.dart';
import 'core/push/firebase_push_messaging.dart';
import 'core/push/push_navigation.dart';
import 'core/storage/secure_token_store.dart';
import 'core/theme/admin_theme.dart';
import 'data/admin_api.dart';
import 'features/accounts/accounts_controller.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/dashboard_controller.dart';
import 'features/sales/sales_controller.dart';
import 'features/shell/admin_shell.dart';

final adminNavigatorKey = GlobalKey<NavigatorState>();
final adminMessengerKey = GlobalKey<ScaffoldMessengerState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Intl.defaultLocale = 'pt_BR';
  await initializeDateFormatting('pt_BR');
  final client = ApiClient();
  final api = HttpAdminApi(client);
  final push = AdminPushCoordinator(
    api: api,
    messaging: FirebasePushMessaging(),
  );
  final auth = AuthController(
    api: api,
    client: client,
    storage: SecureTokenStore(),
    push: push,
  );
  await auth.bootstrap();
  runApp(
    MultiProvider(
      providers: [
        Provider<AdminApi>.value(value: api),
        ChangeNotifierProvider.value(value: push),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => DashboardController(api)),
        ChangeNotifierProvider(create: (_) => AccountsController(api)),
        ChangeNotifierProvider(create: (_) => SalesController(api)),
      ],
      child: const AfterAdminApp(),
    ),
  );
}

class AfterAdminApp extends StatelessWidget {
  const AfterAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'After Admin',
      debugShowCheckedModeBanner: false,
      navigatorKey: adminNavigatorKey,
      scaffoldMessengerKey: adminMessengerKey,
      theme: AdminTheme.light,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final push = context.watch<AdminPushCoordinator>();
    if (auth.bootstrapping) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!auth.isAuthenticated) {
      return const LoginScreen();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!context.mounted) return;
      final snack = push.takeForeground();
      if (snack != null) {
        adminMessengerKey.currentState
          ?..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: Text(
                [snack.title, snack.body].whereType<String>().join('\n'),
              ),
              action: snack.target == null
                  ? null
                  : SnackBarAction(
                      label: 'Abrir',
                      onPressed: () {
                        final nav = adminNavigatorKey.currentContext;
                        if (nav != null) {
                          openAdminPushTarget(nav, snack.target!);
                        }
                      },
                    ),
            ),
          );
      }
      final target = push.takePending();
      if (target != null) {
        final nav = adminNavigatorKey.currentContext;
        if (nav != null) {
          openAdminPushTarget(nav, target);
        }
      }
    });
    return const AdminShell();
  }
}
