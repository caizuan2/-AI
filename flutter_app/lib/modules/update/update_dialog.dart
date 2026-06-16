import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import 'update_manifest.dart';
import 'update_service.dart';

Future<void> showUpdateDialog(
  BuildContext context, {
  required UpdateManifest manifest,
  required bool force,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !force,
    builder: (context) {
      return PopScope(
        canPop: !force,
        child: AlertDialog(
          title: const Text('发现新版本'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                      '当前版本：${AppConfig.currentVersion} (${AppConfig.currentBuild})'),
                  Text('最新版本：${manifest.version} (${manifest.build})'),
                  if (manifest.releaseNotes.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      '更新内容',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 8),
                    ...manifest.releaseNotes.map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('- $item'),
                      ),
                    ),
                  ],
                  if (force) ...[
                    const SizedBox(height: 16),
                    const Text(
                      '该版本为强制更新，请完成更新后继续使用。',
                      style: TextStyle(
                        color: Color(0xFFB91C1C),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            if (!force)
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('稍后再说'),
              ),
            FilledButton(
              onPressed: manifest.currentPlatformDownloadUrl.isEmpty
                  ? null
                  : () => _openDownloadUrl(
                      context, manifest.currentPlatformDownloadUrl),
              child: const Text('立即更新'),
            ),
          ],
        ),
      );
    },
  );
}

Future<void> showUpdateCheckFailedDialog(
  BuildContext context, {
  VoidCallback? onRetry,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text(UpdateFetchException.userTitle),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(UpdateFetchException.userMessage),
              SizedBox(height: 10),
              Text(
                UpdateFetchException.userHint,
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              onRetry?.call();
            },
            child: const Text('重试'),
          ),
          FilledButton(
            onPressed: () =>
                _openDownloadUrl(context, AppConfig.downloadPageUrl),
            child: const Text('打开下载页'),
          ),
        ],
      );
    },
  );
}

Future<void> openUpdateUrl(BuildContext context, String url) {
  return _openDownloadUrl(context, url);
}

Future<void> _openDownloadUrl(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) {
    await _showUpdateLinkError(context, '下载地址无效');
    return;
  }

  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    await _showUpdateLinkError(context, '无法打开下载地址');
  }
}

Future<void> _showUpdateLinkError(BuildContext context, String message) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('打开更新链接失败'),
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('知道了'),
          ),
        ],
      );
    },
  );
}
