enum ReportTargetType {
  venue('VENUE'),
  banner('BANNER'),
  photo('PHOTO'),
  video('VIDEO'),
  review('REVIEW');

  const ReportTargetType(this.apiValue);
  final String apiValue;
}

enum ReportReason {
  inappropriate('INAPPROPRIATE', 'Conteúdo impróprio ou ofensivo'),
  spam('SPAM', 'Spam'),
  misleading('MISLEADING', 'Informação falsa ou enganosa'),
  violence('VIOLENCE', 'Violência ou conteúdo perigoso'),
  sexual('SEXUAL', 'Conteúdo sexual ou impróprio'),
  hate('HATE', 'Discurso de ódio ou assédio'),
  copyright('COPYRIGHT', 'Violação de direitos autorais'),
  other('OTHER', 'Outro');

  const ReportReason(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

const reportSuccessMessage =
    'Denúncia enviada. Obrigado por nos ajudar a manter o After seguro.';
