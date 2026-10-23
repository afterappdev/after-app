import '../../core/network/api_client.dart';
import '../auth/auth_controller.dart';
import 'fiscal_invoice_controller.dart';

/// Loads the authenticated venue document. A failure leaves checkout unchanged.
Future<void> loadVenueFiscalDocument({
  required ApiClient api,
  required AuthController auth,
  required FiscalInvoiceController fiscal,
  void Function()? onLoaded,
}) async {
  final user = auth.user;
  final venueId = user?.venueId;
  if (user == null || !user.isVenue || venueId == null || venueId.isEmpty) {
    return;
  }
  if (!fiscal.beginVenueDocumentLoad()) return;
  try {
    final data = await api.get('/venues/$venueId/fiscal-document');
    if (data is! Map) return;
    fiscal.rememberVenueDocument(
      type: data['documentType']?.toString(),
      digits: data['documentDigits']?.toString(),
      legalName: user.name,
    );
    if (fiscal.invoiceRequested) onLoaded?.call();
  } catch (_) {
    fiscal.cancelVenueDocumentLoad();
  }
}
