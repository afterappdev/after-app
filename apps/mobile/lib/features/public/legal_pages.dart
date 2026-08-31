import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'public_chrome.dart';

class ContactPage extends StatelessWidget {
  const ContactPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const PublicPageFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Contato',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 28,
              color: AppTheme.ink,
            ),
          ),
          SizedBox(height: 12),
          Text(
            'Um e-mail institucional de atendimento ainda não está publicado nesta versão do After.\n\n'
            'Para dados da sua conta, use o aplicativo (Perfil). Para excluir a conta sem estar logado, use a página pública de exclusão de conta.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w400,
              fontSize: 15,
              height: 1.5,
              color: Color(0xFF4A524F),
            ),
          ),
        ],
      ),
    );
  }
}
