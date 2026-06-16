import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';
import 'test_update_actions.dart';
import 'test_update_download_progress.dart';
import 'test_update_manifest.dart';
import 'test_update_service.dart';

class TestUpdateGate extends StatefulWidget {
  const TestUpdateGate({
    required this.testUpdateService,
    required this.child,
    super.key,
  });

  final TestUpdateService testUpdateService;
  final Widget child;

  @override
  State<TestUpdateGate> createState() => _TestUpdateGateState();
}

class _TestUpdateGateState extends State<TestUpdateGate> {
  bool _started = false;
  bool _checking = true;
  Object? _error;
  TestUpdateCheckResult? _result;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) {
      return;
    }
    _started = true;
    if (!widget.testUpdateService.enabled) {
      _checking = false;
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  Future<void> _check() async {
    if (!mounted || !widget.testUpdateService.enabled) {
      return;
    }
    setState(() {
      _checking = true;
      _error = null;
      _result = null;
    });

    try {
      final result = await widget.testUpdateService.checkForUpdate();
      if (!mounted) {
        return;
      }
      setState(() {
        _checking = false;
        _result = result;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      debugPrint('User test force update gate failed: $error');
      setState(() {
        _checking = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.testUpdateService.enabled) {
      return widget.child;
    }

    if (_checking) {
      return const _GateShell(
        title: '正在检查测试版更新',
        message: '正在读取 GitHub user-test 版本信息...',
        child: Padding(
          padding: EdgeInsets.only(top: 18),
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_error != null) {
      return _GateShell(
        title: '无法检查测试版更新',
        message: '无法检查测试版更新，请检查网络后重试。',
        detail: _error.toString(),
        child: Padding(
          padding: const EdgeInsets.only(top: 18),
          child: FilledButton.icon(
            onPressed: _check,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('重新检查'),
          ),
        ),
      );
    }

    final result = _result;
    final manifest = result?.manifest;
    if (result != null && result.shouldPrompt && manifest != null) {
      return _ForceUpdateView(manifest: manifest);
    }

    return widget.child;
  }
}

class _ForceUpdateView extends StatefulWidget {
  const _ForceUpdateView({required this.manifest});

  final TestUpdateManifest manifest;

  @override
  State<_ForceUpdateView> createState() => _ForceUpdateViewState();
}

class _ForceUpdateViewState extends State<_ForceUpdateView> {
  bool _updating = false;
  TestUpdateDownloadProgress? _progress;
  String? _status;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: _GateShell(
        title: '发现测试版更新',
        message: '当前测试版已过期，请更新后继续使用。',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            const _InfoLine(
              label: '当前版本',
              value:
                  '${AppConfig.currentVersion} (${AppConfig.currentTestBuildNumber})',
            ),
            _InfoLine(
              label: '最新版本',
              value:
                  '${widget.manifest.version} (${widget.manifest.buildNumber})',
            ),
            _InfoLine(label: '更新时间', value: widget.manifest.buildTime),
            if (widget.manifest.sourceUrl.isNotEmpty)
              _InfoLine(label: '下载源', value: widget.manifest.sourceUrl),
            if (widget.manifest.sourceBuildSummary.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '源结果：\n${widget.manifest.sourceBuildSummary}',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  height: 1.45,
                ),
              ),
            ],
            const SizedBox(height: 14),
            Text(
              '更新内容',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
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
              LinearProgressIndicator(value: _progress?.fraction),
              const SizedBox(height: 8),
              Text(
                _progress == null
                    ? '正在选择最快下载源...'
                    : '下载进度：${_progress!.percentLabel}\n'
                        '已下载：${_progress!.sizeLabel}\n'
                        '下载速度：${_progress!.speedLabel}\n'
                        '下载源：${_progress!.sourceUrl}',
                style: const TextStyle(
                  color: Color(0xFF475569),
                  fontSize: 13,
                  height: 1.45,
                ),
              ),
            ],
            if (_status != null) ...[
              const SizedBox(height: 12),
              Text(
                _status!,
                style: const TextStyle(
                  color: Color(0xFF475569),
                  fontSize: 13,
                  height: 1.45,
                ),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _updating ? null : _startUpdate,
              icon: Icon(_updating
                  ? Icons.downloading_rounded
                  : Icons.system_update_alt_rounded),
              label: Text(_buttonLabel),
            ),
          ],
        ),
      ),
    );
  }

  String get _buttonLabel {
    if (!_updating) {
      return '立即更新';
    }
    final progress = _progress;
    if (progress == null) {
      return '下载中';
    }
    return '下载中 ${progress.percentLabel}';
  }

  Future<void> _startUpdate() async {
    setState(() {
      _updating = true;
      _progress = null;
      _status = null;
    });

    try {
      final result = await startTestUpdate(
        widget.manifest,
        onDownloadProgress: (progress) {
          if (!mounted) {
            return;
          }
          setState(() => _progress = progress);
        },
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _updating = false;
        _status = '${result.title}\n${result.message}';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      debugPrint('Forced user-test update failed: $error');
      setState(() {
        _updating = false;
        _status = '下载失败，请检查网络后重试。\n$error';
      });
    }
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        '$label：$value',
        style: const TextStyle(
          color: Color(0xFF475569),
          fontSize: 13,
          height: 1.45,
        ),
      ),
    );
  }
}

class _GateShell extends StatelessWidget {
  const _GateShell({
    required this.title,
    required this.message,
    required this.child,
    this.detail,
  });

  final String title;
  final String message;
  final Widget child;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF8FAFC),
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.10),
                    blurRadius: 28,
                    offset: const Offset(0, 14),
                  ),
                ],
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      title,
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: const Color(0xFF0F172A),
                              ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      message,
                      style: const TextStyle(
                        color: Color(0xFF475569),
                        height: 1.55,
                      ),
                    ),
                    if (detail != null && detail!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: const Text('错误详情'),
                        children: [
                          SelectableText(
                            detail!,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                    child,
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
