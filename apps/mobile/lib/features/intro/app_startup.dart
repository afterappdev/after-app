import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';
import '../auth/login_screen.dart';
import '../home/home_screen.dart';
import 'after_intro_screen.dart';
import 'intro_style.dart';

/// Cold-start gate: intro, then the existing login or home screen.
class AppStartup extends StatefulWidget {
  const AppStartup({super.key});

  @override
  State<AppStartup> createState() => _AppStartupState();
}

class _AppStartupState extends State<AppStartup> {
  bool _introDone = false;

  void _finishIntro() {
    if (!mounted || _introDone) return;
    setState(() => _introDone = true);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.bootstrapping) {
      return const ColoredBox(color: IntroStyle.bg);
    }
    if (!_introDone) {
      return AfterIntroScreen(onFinished: _finishIntro);
    }
    return auth.user == null ? const LoginScreen() : const HomeScreen();
  }
}
