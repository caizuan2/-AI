import 'package:url_launcher/url_launcher.dart';

import 'test_update_download_progress.dart';
import 'test_update_manifest.dart';
import 'test_update_service.dart';

Future<TestUpdateActionResult> startTestUpdate(
  TestUpdateManifest manifest, {
  void Function(double? progress)? onProgress,
  void Function(TestUpdateDownloadProgress progress)? onDownloadProgress,
}) async {
  final url = manifest.currentPlatformDownloadUrl;
  if (url.isEmpty) {
    return const TestUpdateActionResult(
      title: '下载地址缺失',
      message: '当前测试版没有可用下载地址。',
    );
  }

  onProgress?.call(null);
  onDownloadProgress?.call(
    TestUpdateDownloadProgress(
      receivedBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      sourceUrl: url,
    ),
  );
  final opened = await launchUrl(
    Uri.parse(url),
    mode: LaunchMode.externalApplication,
  );
  return TestUpdateActionResult(
    title: opened ? '已打开下载链接' : '无法打开下载链接',
    message: opened ? '请在浏览器中下载并安装测试版。' : '请手动打开测试版下载地址：$url',
  );
}
