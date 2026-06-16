class TestUpdateDownloadProgress {
  const TestUpdateDownloadProgress({
    required this.receivedBytes,
    required this.totalBytes,
    required this.bytesPerSecond,
    required this.sourceUrl,
  });

  final int receivedBytes;
  final int totalBytes;
  final double bytesPerSecond;
  final String sourceUrl;

  double? get fraction {
    if (totalBytes <= 0) {
      return null;
    }
    return (receivedBytes / totalBytes).clamp(0, 1).toDouble();
  }

  String get percentLabel {
    final value = fraction;
    if (value == null) {
      return '计算中';
    }
    return '${(value * 100).clamp(0, 100).toStringAsFixed(0)}%';
  }

  String get sizeLabel {
    if (totalBytes <= 0) {
      return '${_formatBytes(receivedBytes)} / 未知大小';
    }
    return '${_formatBytes(receivedBytes)} / ${_formatBytes(totalBytes)}';
  }

  String get speedLabel => '${_formatBytes(bytesPerSecond.round())}/s';

  static String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '$bytes B';
  }
}
