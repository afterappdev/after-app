import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'public_chrome.dart';

class PrivacyPolicyPage extends StatefulWidget {
  const PrivacyPolicyPage({super.key});

  static const lastUpdated = '31 de agosto de 2026';

  @override
  State<PrivacyPolicyPage> createState() => _PrivacyPolicyPageState();
}

class _PrivacyPolicyPageState extends State<PrivacyPolicyPage> {
  late final Map<String, GlobalKey> _keys;

  @override
  void initState() {
    super.initState();
    _keys = {for (final section in _sections) section.id: GlobalKey()};
  }

  static const _sections = <_PrivacySection>[
    _PrivacySection(
      id: 'quem',
      title: '1. Quem somos',
      body:
          'Esta Política descreve como o aplicativo After (“After”, “nós”) trata dados pessoais no uso do app em iOS, Android e Web (incluindo https://app-after.com.br).\n\n'
          'O After é um serviço de descoberta de estabelecimentos, promoções do dia e experiências na sua cidade. Esta página reflete o funcionamento atual do produto, e não promessas de recursos inexistentes.\n\n'
          'Um CNPJ ou razão social do controlador ainda não está publicado nesta versão do app.',
    ),
    _PrivacySection(
      id: 'dados',
      title: '2. Quais dados tratamos',
      body:
          'Conta de usuário ou de estabelecimento:\n'
          '• nome;\n'
          '• e-mail;\n'
          '• senha, quando o cadastro é feito com e-mail (armazenada apenas como hash, não em texto puro);\n'
          '• foto de perfil (avatar), de forma opcional;\n'
          '• cidade e UF;\n'
          '• tipo de conta (cliente ou estabelecimento).\n\n'
          'Dados públicos de estabelecimentos, preenchidos pelo dono da conta:\n'
          '• nome, descrição, categoria, cidade e UF;\n'
          '• logo, capa, fotos e vídeos;\n'
          '• contatos e horários informados no perfil;\n'
          '• coordenadas geográficas do local, quando obtidas a partir do endereço.\n\n'
          'Uso do app:\n'
          '• favoritos de estabelecimentos;\n'
          '• avaliações (nota e depoimento opcional), exibidas no perfil público do local junto com nome e avatar de quem avaliou;\n'
          '• notificações internas sobre publicações de locais que você acompanha;\n'
          '• no Web, o navegador pode pedir permissão para notificações locais do próprio After.\n\n'
          'Compras de créditos por estabelecimentos:\n'
          '• pacote escolhido, valor, moeda, quantidade de créditos, status da compra, identificadores da transação no provedor e data de confirmação.\n\n'
          'No aparelho, o After também guarda:\n'
          '• o token de sessão (JWT) e um resumo da conta, para manter você autenticado;\n'
          '• cidades buscadas recentemente, só neste dispositivo.',
    ),
    _PrivacySection(
      id: 'localizacao',
      title: '3. Localização',
      body:
          'Se você autorizar, o After pode ler uma localização aproximada do dispositivo (precisão baixa) só para calcular distância e ordenar resultados de proximidade na cidade.\n\n'
          'Essa coordenada é enviada na hora da consulta de promoções e locais. Ela não é gravada como um campo permanente do seu cadastro.\n\n'
          'A cidade e a UF da conta (e as que você busca) são usadas para filtrar o conteúdo. Cidades recentes ficam só no dispositivo.\n\n'
          'Para posicionar estabelecimentos no mapa de distância, o servidor pode consultar o Nominatim / OpenStreetMap a partir do endereço público do local e da cidade.',
    ),
    _PrivacySection(
      id: 'midia',
      title: '4. Fotos, vídeos e URLs públicas',
      body:
          'Avatares, logos, capas, galeria, cardápio e imagens de publicação são enviados por quem está autenticado.\n\n'
          'Os arquivos ficam armazenados no servidor e são servidos por URL pública (caminho /uploads/...). Quem tiver o link pode abrir o arquivo. Não use o After para enviar conteúdo que você não deseja tornar acessível dessa forma.',
    ),
    _PrivacySection(
      id: 'login',
      title: '5. Login com Google e Apple',
      body:
          'Você pode entrar com Google Sign-In ou Sign in with Apple, além de e-mail e senha.\n\n'
          'Nesses fluxos, o After recebe um token de identidade do provedor e pode receber nome, e-mail e foto (Google) ou, quando a Apple disponibilizar, e-mail e nome. Também guardamos o identificador da conta Google ou Apple vinculado ao seu usuário After.\n\n'
          'A autenticação segue as regras da Google e da Apple. O After não publica anúncios com esses dados.',
    ),
    _PrivacySection(
      id: 'pagamentos',
      title: '6. Pagamentos',
      body:
          'Estabelecimentos podem comprar créditos para publicar no After. O canal depende da plataforma:\n'
          '• Android: Google Play Billing;\n'
          '• iOS: App Store;\n'
          '• Web: PIX via Mercado Pago.\n\n'
          'O After registra a transação (pacote, valor, status, provedor e identificadores da compra) para liberar os créditos.\n\n'
          'O After não armazena número de cartão, CVV, senha bancária nem dados completos de conta bancária. No PIX, o pagamento ocorre no Mercado Pago; nas lojas, nas regras da Google Play e da App Store.',
    ),
    _PrivacySection(
      id: 'finalidade',
      title: '7. Para que usamos os dados',
      body:
          '• criar e autenticar sua conta;\n'
          '• mostrar locais, promoções do dia e distâncias na cidade;\n'
          '• permitir favoritos, avaliações e o perfil público do estabelecimento;\n'
          '• processar créditos e publicações pagas;\n'
          '• enviar notificações do próprio After sobre esses conteúdos;\n'
          '• cumprir a exclusão da conta quando você pede pelo app ou confirma o link enviado por e-mail.\n\n'
          'Não usamos os dados para publicidade de terceiros.',
    ),
    _PrivacySection(
      id: 'compartilhamento',
      title: '8. Com quem compartilhamos',
      body:
          'Além do que já é público no app (perfis de locais, avaliações, mídias por URL), o After aciona provedores só para operar o serviço:\n'
          '• Google (login);\n'
          '• Apple (login e, no iOS, cobrança na App Store);\n'
          '• Google Play (cobrança no Android);\n'
          '• Mercado Pago (PIX no Web);\n'
          '• Nominatim / OpenStreetMap (geocodificação de endereços e cidades).\n\n'
          'Não vendemos cadastro e não integramos redes de anúncio de terceiros.',
    ),
    _PrivacySection(
      id: 'analytics',
      title: '9. Publicidade, analytics e rastreamento',
      body:
          'O After, nesta versão, não inclui publicidade de terceiros, pixels de anúncio, Google Analytics, Firebase Analytics nem ferramentas equivalentes de tracking publicitário no app.',
    ),
    _PrivacySection(
      id: 'base',
      title: '10. Base legal (LGPD)',
      body:
          'Tratamos dados para executar o contrato de uso do After (cadastro, login, descoberta de locais, favoritos, avaliações e publicações) e, quando você autoriza a localização do aparelho, com base nesse consentimento, que pode ser recusado ou revogado nas permissões do sistema.\n\n'
          'Pagamentos seguem a relação com o estabelecimento e os provedores de pagamento. Obedecemos a Lei nº 13.709/2018 (LGPD) no que se aplica a esse tratamento.',
    ),
    _PrivacySection(
      id: 'direitos',
      title: '11. Seus direitos e exclusão da conta',
      body:
          'Você pode acessar e atualizar nome, cidade/UF e avatar no próprio app (Perfil).\n\n'
          'A exclusão da conta pode ser feita de duas formas:\n'
          '• no After, autenticado, em Perfil → Excluir conta;\n'
          '• pela página pública de exclusão, informando o e-mail da conta. Enviamos um link temporário só para esse e-mail; a conta só é excluída depois da confirmação nesse link.\n\n'
          'A exclusão remove a conta e os uploads associados (fotos, vídeos e publicações do local, quando for conta de estabelecimento). Não pode ser desfeita. Dados só são mantidos se houver obrigação legal; nesta versão o After não define um prazo extra de guarda.',
    ),
    _PrivacySection(
      id: 'retencao',
      title: '12. Conservação',
      body:
          'Os dados da conta permanecem enquanto ela existir. Após a exclusão, o cadastro e os arquivos de upload ligados a ela são removidos.\n\n'
          'Registros de compra de créditos existem para controlar o saldo e o status do pagamento enquanto a conta de estabelecimento estiver ativa.\n\n'
          'Token de sessão e cidades recentes ficam no dispositivo até você sair da conta, excluí-la ou limpar os dados do app.',
    ),
    _PrivacySection(
      id: 'seguranca',
      title: '13. Segurança',
      body:
          'A API autentica com JWT. A senha de e-mail não é armazenada em texto puro. Ainda assim, nenhum sistema é isento de risco; use uma senha exclusiva e não compartilhe o acesso.',
    ),
    _PrivacySection(
      id: 'menores',
      title: '14. Crianças e adolescentes',
      body:
          'O After não oferece um fluxo específico para contas de crianças. Não cadastre dados de menores se você não for o responsável e se isso não for adequado ao uso do serviço.',
    ),
    _PrivacySection(
      id: 'mudancas',
      title: '15. Alterações',
      body:
          'Se o tratamento de dados mudar de forma relevante, esta página será atualizada com nova data. O uso continuado do After depois da alteração significa que a versão vigente passou a valer para esse uso.',
    ),
    _PrivacySection(
      id: 'contato',
      title: '16. Contato',
      body:
          'Um e-mail institucional de atendimento ainda não está publicado nesta versão. Para dados da sua conta, use o After (Perfil e exclusão de conta).\n\n'
          'Há também a página pública de Contato no site.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    final keys = _keys;

    return PublicChrome(
      body: ColoredBox(
        color: AppTheme.canvas,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                compact ? 16 : 28,
                compact ? 24 : 36,
                compact ? 16 : 28,
                40,
              ),
              children: [
                Text(
                  'Política de Privacidade',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: compact ? 28 : 34,
                    color: AppTheme.ink,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Última atualização: ${PrivacyPolicyPage.lastUpdated}',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                    color: AppTheme.muted,
                  ),
                ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: const Key('privacy-back'),
                    onPressed: () => goToPublicHome(context),
                    child: const Text('Voltar para o início'),
                  ),
                ),
                const SizedBox(height: 8),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.sageBorder),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Nesta página',
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: AppTheme.ink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (final section in _sections)
                          TextButton(
                            onPressed: () {
                              final key = keys[section.id];
                              if (key?.currentContext == null) return;
                              Scrollable.ensureVisible(
                                key!.currentContext!,
                                duration: const Duration(milliseconds: 280),
                                curve: Curves.easeOutCubic,
                                alignment: 0.08,
                              );
                            },
                            style: TextButton.styleFrom(
                              alignment: Alignment.centerLeft,
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              foregroundColor: AppTheme.ink,
                              textStyle: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                            child: Text(section.title),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                for (final section in _sections) ...[
                  KeyedSubtree(
                    key: keys[section.id],
                    child: _PrivacyBlock(section: section),
                  ),
                  const SizedBox(height: 14),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PrivacySection {
  const _PrivacySection({
    required this.id,
    required this.title,
    required this.body,
  });

  final String id;
  final String title;
  final String body;
}

class _PrivacyBlock extends StatelessWidget {
  const _PrivacyBlock({required this.section});

  final _PrivacySection section;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.sageBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              section.title,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: AppTheme.ink,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              section.body,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w400,
                fontSize: 14,
                height: 1.5,
                color: Color(0xFF4A524F),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
