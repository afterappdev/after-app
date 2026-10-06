/// Editable fields copied from a past publication into a new draft.
///
/// The source row is only a template. Identity, status, dates, billing and
/// timestamps are never copied.
class PublicationDraft {
  const PublicationDraft({
    required this.imageUrl,
    required this.title,
    required this.description,
  });

  final String? imageUrl;
  final String title;
  final String description;

  static PublicationDraft fromHistory(Map<String, dynamic> banner) {
    final image = banner['imageUrl']?.toString().trim() ?? '';
    return PublicationDraft(
      imageUrl: image.isEmpty ? null : image,
      title: banner['title']?.toString() ?? '',
      description: banner['description']?.toString() ?? '',
    );
  }
}
