import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import '../auth/login_screen.dart';
import '../auth/register_screen.dart';
import '../home/home_screen.dart';
import 'landing_page.dart';

/// Web `/`: landing pública se não houver sessão; HOME se já autenticado.
/// Não substitui o intro nativo (Android/iOS).
class WebRoot extends StatelessWidget {
  const WebRoot({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.bootstrapping) {
      return const ColoredBox(color: AppTheme.canvas);
    }
    if (auth.user != null) return const HomeScreen();
    if (auth.pendingSocialOnboarding != null) {
      return const RegisterScreen(showPublicHomeLink: true);
    }
    return const LandingPage();
  }
}

/// Garante que o `/login` nomeado volte ao app após autenticar.
/// O [LoginScreen] em si não navega: no nativo isso fica a cargo do [AppStartup].
class LoginScreenRoute extends StatelessWidget {
  const LoginScreenRoute({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.user != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        final route = ModalRoute.of(context);
        if (route?.isCurrent != true) return;
        final nav = Navigator.of(context);
        if (nav.canPop()) {
          nav.popUntil((r) => r.isFirst);
        } else {
          nav.pushReplacementNamed(AppRoutes.home);
        }
      });
    } else if (auth.pendingSocialOnboarding != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        final route = ModalRoute.of(context);
        if (route?.isCurrent != true) return;
        Navigator.of(context).pushNamed(AppRoutes.register);
      });
    }
    return const LoginScreen(showPublicHomeLink: true);
  }
}
