import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';
import 'update_dialog.dart';
import 'update_service.dart';

class UpdatePage extends StatefulWidget {
  const UpdatePage({
    required this.updateService,
    super.key,
  });

  static const routeName = '/update';

  final UpdateService updateService;

  @override
  State<UpdatePage> createState() => _UpdatePageState();
}

class _UpdatePageState extends State<UpdatePage> {
  Future<UpdateCheckResult>? _future;

  @override
  void initState() {
    super.initState();
    _future = widget.updateService.checkForUpdate();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('更新检测')),
      body: FutureBuilder<UpdateCheckResult>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _UpdatePanel(
              title: UpdateFetchException.userTitle,
              body:
                  '${UpdateFetchException.userMessage}\n\n${UpdateFetchException.userHint}',
              action: Wrap(
                spacing: 12,
                runSpacing: 12,
                alignment: WrapAlignment.center,
                children: [
                  OutlinedButton(
                    onPressed: _retry,
                    child: const Text('重试'),
                  ),
                  FilledButton(
                    onPressed: () =>
                        openUpdateUrl(context, AppConfig.downloadPageUrl),
                    child: const Text('打开下载页'),
                  ),
                ],
              ),
            );
          }

          final result = snapshot.data!;
          final manifest = result.manifest;

          return _UpdatePanel(
            title: result.shouldPrompt ? '发现新版本' : '已是最新版本',
            body:
                '当前版本：${AppConfig.currentVersion} (${AppConfig.currentBuild})\n最新版本：${manifest.version} (${manifest.build})',
            action: result.shouldPrompt
                ? FilledButton(
                    onPressed: () => showUpdateDialog(
                      context,
                      manifest: manifest,
                      force: result.forceUpdate,
                    ),
                    child: const Text('查看更新'),
                  )
                : FilledButton(
                    onPressed: _retry,
                    child: const Text('重新检查'),
                  ),
          );
        },
      ),
    );
  }

  void _retry() {
    setState(() => _future = widget.updateService.checkForUpdate());
  }
}

class _UpdatePanel extends StatelessWidget {
  const _UpdatePanel({
    required this.title,
    required this.body,
    required this.action,
  });

  final String title;
  final String body;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 12),
            Text(
              body,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            action,
          ],
        ),
      ),
    );
  }
}
