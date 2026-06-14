class UploadFile {
  const UploadFile({
    required this.name,
    required this.bytes,
    this.mimeType,
  });

  final String name;
  final List<int> bytes;
  final String? mimeType;
}
