/// Resultado de POST /venues + pós-processamento (lista e troca opcional).
class OwnedVenueCreateResult {
  const OwnedVenueCreateResult._({
    this.venueId,
    this.createError,
    this.switchWarning,
  });

  final String? venueId;
  final String? createError;
  /// Cadastro OK, mas PUT active-venue falhou (não repetir POST).
  final String? switchWarning;

  bool get created => venueId != null && createError == null;

  factory OwnedVenueCreateResult.failure(String message) =>
      OwnedVenueCreateResult._(createError: message);

  factory OwnedVenueCreateResult.success({
    required String venueId,
    String? switchWarning,
  }) =>
      OwnedVenueCreateResult._(
        venueId: venueId,
        switchWarning: switchWarning,
      );
}
