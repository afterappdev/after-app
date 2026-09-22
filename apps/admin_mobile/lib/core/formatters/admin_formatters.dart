import 'package:intl/intl.dart';

final NumberFormat _brl = NumberFormat.currency(
  locale: 'pt_BR',
  symbol: r'R$',
  decimalDigits: 2,
);

final DateFormat _date = DateFormat('dd/MM/yyyy', 'pt_BR');
final DateFormat _dateTime = DateFormat('dd/MM/yyyy HH:mm', 'pt_BR');

String formatBrl(num value) => _brl.format(value);

String formatDate(DateTime? value) {
  if (value == null) return '—';
  return _date.format(value.toLocal());
}

String formatDateTime(DateTime? value) {
  if (value == null) return '—';
  return _dateTime.format(value.toLocal());
}

String formatCount(num value) {
  return NumberFormat.decimalPattern('pt_BR').format(value);
}

String providerLabel(String? provider) {
  switch ((provider ?? '').trim().toLowerCase()) {
    case 'google_play':
      return 'Google Play';
    case 'app_store':
    case 'apple_app_store':
      return 'Apple';
    case 'pix':
      return 'PIX';
    default:
      return provider?.trim().isNotEmpty == true ? provider!.trim() : '—';
  }
}

String roleLabel(String? role) {
  switch ((role ?? '').trim().toUpperCase()) {
    case 'USER':
      return 'Usuário';
    case 'VENUE':
      return 'Estabelecimento';
    case 'ADMIN':
      return 'Administrador';
    default:
      return role?.trim().isNotEmpty == true ? role!.trim() : '—';
  }
}

const _monthNames = <String>[
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

String monthAbbrevFromYearMonth(String yearMonth) {
  final parts = yearMonth.split('-');
  if (parts.length < 2) return yearMonth;
  final month = int.tryParse(parts[1]) ?? 0;
  if (month < 1 || month > 12) return yearMonth;
  return _monthNames[month - 1];
}

String reportStatusLabel(String? status) {
  switch ((status ?? '').trim().toUpperCase()) {
    case 'PENDING':
      return 'Pendente';
    case 'REVIEWING':
      return 'Em análise';
    case 'RESOLVED':
      return 'Resolvida';
    case 'REJECTED':
      return 'Rejeitada';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

String reportTargetLabel(String? type) {
  switch ((type ?? '').trim().toUpperCase()) {
    case 'VENUE':
      return 'Estabelecimento';
    case 'BANNER':
      return 'Promoção';
    case 'PHOTO':
      return 'Foto';
    case 'VIDEO':
      return 'Vídeo';
    case 'REVIEW':
      return 'Avaliação';
    default:
      return type?.trim().isNotEmpty == true ? type!.trim() : '—';
  }
}

String reportReasonLabel(String? reason) {
  switch ((reason ?? '').trim().toUpperCase()) {
    case 'INAPPROPRIATE':
      return 'Conteúdo impróprio ou ofensivo';
    case 'SPAM':
      return 'Spam';
    case 'MISLEADING':
      return 'Informação falsa ou enganosa';
    case 'VIOLENCE':
      return 'Violência ou conteúdo perigoso';
    case 'SEXUAL':
      return 'Conteúdo sexual ou impróprio';
    case 'HATE':
      return 'Discurso de ódio ou assédio';
    case 'COPYRIGHT':
      return 'Violação de direitos autorais';
    case 'OTHER':
      return 'Outro';
    default:
      return reason?.trim().isNotEmpty == true ? reason!.trim() : '—';
  }
}

String statusLabel(String? status) {
  switch ((status ?? '').trim().toUpperCase()) {
    case 'PAID':
      return 'Pago';
    case 'PENDING':
      return 'Pendente';
    case 'FAILED':
      return 'Falhou';
    case 'CANCELLED':
      return 'Cancelado';
    case 'REFUNDED':
      return 'Reembolsado';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}
