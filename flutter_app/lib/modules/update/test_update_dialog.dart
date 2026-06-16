import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../core/config/app_config.dart';
import 'test_update_actions.dart';
import 'test_update_download_progress.dart';
import 'test_update_manifest.dart';
import 'test_update_service.dart';

void _showTestUpdateLocalHint(BuildContext context, String message) {
  final overlay = Overlay.maybeOf(context);
  final targetObject = context.findRenderObject();
  final overlayObject = overlay?.context.findRenderObject();
  if (overlay == null ||
      targetObject is! RenderBox ||
      overlayObject is! RenderBox ||
      !targetObject.attached ||
      !overlayObject.attached) {
    debugPrint(message);
    return;
  }

  final targetOffset = overlayObject.globalToLocal(
    targetObject.localToGlobal(Offset.zero),
  );
  final targetSize = targetObject.size;
  final overlaySize = overlayObject.size;
  const width = 92.0;
  final maxLeft =
      overlaySize.width > width + 16 ? overlaySize.width - width - 8 : 8.0;
  final maxTop = overlaySize.height > 50 ? overlaySize.height - 42 : 8.0;
  final left = (targetOffset.dx + targetSize.width / 2 - width / 2)
      .clamp(8.0, maxLeft)
      .toDouble();
  final top = (targetOffset.dy - 36).clamp(8.0, maxTop).toDouble();

  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => Positioned(
      left: left,
      top: top,
      child: IgnorePointer(
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: width,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xE60F172A),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  overlay.insert(entry);
  Future<void>.delayed(const Duration(milliseconds: 1050), entry.remove);
}

Future<void> showTestUpdateDialog(
  BuildContext context, {
  required TestUpdateManifest manifest,
  required bool force,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !force,
    builder: (context) {
      return _TestUpdateDialog(
        manifest: manifest,
        force: force,
      );
    },
  );
}

Future<void> showNoTestUpdateDialog(
  BuildContext context, {
  required TestUpdateCheckResult result,
}) {
  final manifest = result.manifest;
  final sourceUrl = manifest?.sourceUrl.isNotEmpty == true
      ? manifest!.sourceUrl
      : AppConfig.userTestManifestUrl;
  final localBuild = AppConfig.currentTestBuildNumber;
  final title = manifest != null && manifest.buildNumber < localBuild
      ? '当前本地版本较新'
      : '当前已是最新测试版';
  final statusText = manifest != null && manifest.buildNumber < localBuild
      ? '当前本地版本高于远程测试版，不会回退更新。'
      : '当前已是最新测试版。';
  return showDialog<void>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: Text(title),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Text(
            manifest == null
                ? '当前渠道：${AppConfig.appChannel}\n测试版自动更新仅在 user-test 渠道启用。'
                : '$statusText\n'
                    '当前本地版本：${AppConfig.currentVersion} ($localBuild)\n'
                    '远程测试版：${manifest.version} (${manifest.buildNumber})\n'
                    '更新时间：${manifest.buildTime}\n'
                    '实际读取地址：$sourceUrl'
                    '${manifest.sourceBuildSummary.isEmpty ? '' : '\n\n源结果：\n${manifest.sourceBuildSummary}'}',
          ),
        ),
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

Future<void> showTestUpdateFailedDialog(
  BuildContext context, {
  Object? error,
}) {
  final detail = error?.toString() ?? '未知错误';
  final attemptedCount =
      error is TestUpdateFetchException ? error.attemptedCount : null;
  final userMessage = !kIsWeb && defaultTargetPlatform == TargetPlatform.android
      ? 'Android 未能连接测试版版本文件，请检查网络，或稍后再试。'
      : TestUpdateFetchException.userMessage;
  return showDialog<void>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('检查测试版更新失败'),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(userMessage),
                const SizedBox(height: 12),
                Text(
                  '当前本地版本：${AppConfig.currentVersion} (${AppConfig.currentTestBuildNumber})\n'
                  '最新版本：获取失败\n'
                  '主远程地址：${AppConfig.userTestManifestUrl}'
                  '${attemptedCount == null ? '' : '\n已尝试地址数量：$attemptedCount'}',
                  style: const TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 12),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('错误详情'),
                  childrenPadding: EdgeInsets.zero,
                  children: [
                    SelectableText(
                      detail,
                      style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: detail));
              _showTestUpdateLocalHint(context, '已复制');
            },
            child: const Text('复制错误信息'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('知道了'),
          ),
        ],
      );
    },
  );
}

class _TestUpdateDialog extends StatefulWidget {
  const _TestUpdateDialog({
    required this.manifest,
    required this.force,
  });

  final TestUpdateManifest manifest;
  final bool force;

  @override
  State<_TestUpdateDialog> createState() => _TestUpdateDialogState();
}

class _TestUpdateDialogState extends State<_TestUpdateDialog> {
  bool _updating = false;
  double? _progress;
  TestUpdateDownloadProgress? _downloadProgress;
  String? _status;

  @override
  Widget build(BuildContext context) {
    final actionLabel =
        defaultTargetPlatform == TargetPlatform.windows ? '立即更新并重启' : '立即更新';

    return PopScope(
      canPop: !widget.force && !_updating,
      child: AlertDialog(
        title: const Text('发现测试版更新'),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '当前本地版本：${AppConfig.currentVersion} (${AppConfig.currentTestBuildNumber})',
                ),
                Text(
                  '远程测试版：${widget.manifest.version} (${widget.manifest.buildNumber})',
                ),
                if (widget.manifest.sourceUrl.isNotEmpty)
                  Text(
                    '实际读取地址：${widget.manifest.sourceUrl}',
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 12,
                    ),
                  ),
                if (widget.manifest.sourceBuildSummary.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    '源结果：\n${widget.manifest.sourceBuildSummary}',
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ],
                Text(
                  '更新时间：${widget.manifest.buildTime.isEmpty ? '未提供' : widget.manifest.buildTime}',
                ),
                const SizedBox(height: 14),
                Text(
                  '更新内容',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                if (widget.manifest.changelog.isEmpty)
                  const Text('- 本次测试版未填写更新内容')
                else
                  ...widget.manifest.changelog.map(
                    (item) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('- $item'),
                    ),
                  ),
                if (_updating) ...[
                  const SizedBox(height: 18),
                  LinearProgressIndicator(value: _progress),
                  const SizedBox(height: 8),
                  Text(
                    _downloadProgress == null
                        ? '正在选择下载源...'
                        : '下载进度：${_downloadProgress!.percentLabel}\n'
                            '已下载：${_downloadProgress!.sizeLabel}\n'
                            '下载速度：${_downloadProgress!.speedLabel}\n'
                            '下载源：${_downloadProgress!.sourceUrl}',
                    style: const TextStyle(color: Color(0xFF64748B)),
                  ),
                ],
                if (_status != null) ...[
                  const SizedBox(height: 14),
                  Text(_status!),
                ],
                if (widget.force) ...[
                  const SizedBox(height: 14),
                  const Text(
                    '当前测试版已过期，请更新后继续使用。',
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
          if (!widget.force)
            TextButton(
              onPressed: _updating ? null : () => Navigator.of(context).pop(),
              child: const Text('稍后再说'),
            ),
          FilledButton(
            onPressed: _updating ? null : _startUpdate,
            child: Text(_updating ? '下载中...' : actionLabel),
          ),
        ],
      ),
    );
  }

  Future<void> _startUpdate() async {
    setState(() {
      _updating = true;
      _progress = null;
      _downloadProgress = null;
      _status = null;
    });

    try {
      final result = await startTestUpdate(
        widget.manifest,
        onProgress: (progress) {
          if (!mounted) {
            return;
          }
          setState(() => _progress = progress);
        },
        onDownloadProgress: (progress) {
          if (!mounted) {
            return;
          }
          setState(() => _downloadProgress = progress);
        },
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _updating = false;
        _progress = null;
        _downloadProgress = null;
        _status = '${result.title}\n${result.message}';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _updating = false;
        _progress = null;
        _downloadProgress = null;
        _status = '测试版下载失败，请稍后重试，或手动打开 GitHub user-test 下载。';
      });
    }
  }
}
