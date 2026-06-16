import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_service.dart';
import '../../core/config/app_config.dart';
import '../update/update_dialog.dart';
import '../update/update_service.dart';
import '../update/test_update_dialog.dart';
import '../update/test_update_service.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({
    required this.apiService,
    super.key,
  });

  static const routeName = '/settings';

  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _InfoTile(
            label: 'API Base URL',
            value: apiService.baseUrl,
          ),
          _InfoTile(
            label: '运行模式',
            value: apiService.mockMode ? 'Mock 演示模式' : '真实 API 模式',
          ),
          const _InfoTile(
            label: '当前版本',
            value: '${AppConfig.currentVersion} (${AppConfig.currentBuild})',
          ),
          const _InfoTile(
            label: '更新清单',
            value: AppConfig.latestJsonUrl,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _checkUpdates(context),
            icon: const Icon(Icons.system_update_alt),
            label: const Text('检查更新'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _checkTestUpdates(context),
            icon: const Icon(Icons.science_outlined),
            label: const Text('检查测试版更新'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () =>
                Navigator.of(context).pushReplacementNamed('/login'),
            icon: const Icon(Icons.logout),
            label: const Text('退出到登录页'),
          ),
        ],
      ),
    );
  }

  Future<void> _checkUpdates(BuildContext context) async {
    final updateService = context.read<UpdateService>();

    try {
      final result = await updateService.checkForUpdate();
      if (!context.mounted) {
        return;
      }

      if (result.shouldPrompt) {
        await showUpdateDialog(
          context,
          manifest: result.manifest,
          force: result.forceUpdate,
        );
        return;
      }

      await showDialog<void>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('当前已是最新版本'),
            content: const Text('当前安装的用户端已经是最新正式版本。'),
            actions: [
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('知道了'),
              ),
            ],
          );
        },
      );
    } catch (error) {
      debugPrint('Manual update check failed: $error');
      if (!context.mounted) {
        return;
      }
      await showUpdateCheckFailedDialog(
        context,
        onRetry: () => _checkUpdates(context),
      );
    }
  }

  Future<void> _checkTestUpdates(BuildContext context) async {
    final service = context.read<TestUpdateService>();
    try {
      final result = await service.checkForUpdate();
      if (!context.mounted) {
        return;
      }

      final manifest = result.manifest;
      if (result.shouldPrompt && manifest != null) {
        await showTestUpdateDialog(
          context,
          manifest: manifest,
          force: result.forceUpdate,
        );
        return;
      }

      await showNoTestUpdateDialog(context, result: result);
    } catch (error) {
      debugPrint('Manual user-test update check failed: $error');
      if (context.mounted) {
        await showTestUpdateFailedDialog(context, error: error);
      }
    }
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      child: ListTile(
        title: Text(label),
        subtitle: Text(value),
      ),
    );
  }
}
