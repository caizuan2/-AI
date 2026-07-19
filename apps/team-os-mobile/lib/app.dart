import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'core/app_config.dart';
import 'core/app_theme.dart';
import 'webview/team_os_webview.dart';

class TeamOsApp extends StatefulWidget {
  const TeamOsApp({super.key});

  @override
  State<TeamOsApp> createState() => _TeamOsAppState();
}

class _TeamOsAppState extends State<TeamOsApp> {
  late Future<_AppBootstrap> _bootstrap;

  @override
  void initState() {
    super.initState();
    _bootstrap = _prepare();
  }

  Future<_AppBootstrap> _prepare() async {
    final config = AppConfig.fromEnvironment();
    WebViewEnvironment? environment;

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.windows) {
      final version = await WebViewEnvironment.getAvailableVersion();
      if (version == null) {
        throw const AppStartupException(
          '当前设备缺少 Microsoft Edge WebView2 Runtime，无法启动企业工作台。',
        );
      }
      final localAppData = Platform.environment['LOCALAPPDATA'];
      if (localAppData == null || localAppData.trim().isEmpty) {
        throw const AppStartupException('无法定位 Windows 应用数据目录。');
      }
      final dataDirectory = Directory(
        '$localAppData${Platform.pathSeparator}AI Team OS${Platform.pathSeparator}WebView2',
      );
      await dataDirectory.create(recursive: true);
      environment = await WebViewEnvironment.create(
        settings: WebViewEnvironmentSettings(
          userDataFolder: dataDirectory.path,
        ),
      );
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      await InAppWebViewController.setWebContentsDebuggingEnabled(kDebugMode);
    }

    await Future<void>.delayed(const Duration(milliseconds: 650));
    return _AppBootstrap(config: config, webViewEnvironment: environment);
  }

  void _retry() {
    setState(() {
      _bootstrap = _prepare();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AI Team OS',
      theme: buildTeamOsTheme(),
      home: FutureBuilder<_AppBootstrap>(
        future: _bootstrap,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const _LaunchScreen();
          }
          if (snapshot.hasError || snapshot.data == null) {
            return _StartupErrorScreen(
              message: _safeStartupMessage(snapshot.error),
              onRetry: _retry,
            );
          }
          final bootstrap = snapshot.data!;
          return TeamOsWebView(
            config: bootstrap.config,
            webViewEnvironment: bootstrap.webViewEnvironment,
          );
        },
      ),
    );
  }
}

String _safeStartupMessage(Object? error) {
  if (error is AppConfigException || error is AppStartupException) {
    return error.toString();
  }
  return 'APP 初始化失败，请检查平台 WebView 组件后重试。';
}

class _AppBootstrap {
  const _AppBootstrap({required this.config, required this.webViewEnvironment});

  final AppConfig config;
  final WebViewEnvironment? webViewEnvironment;
}

class AppStartupException implements Exception {
  const AppStartupException(this.message);

  final String message;

  @override
  String toString() => message;
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF111827), Color(0xFF312E81)],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.white24),
                ),
                child: const Icon(
                  Icons.hub_rounded,
                  color: Colors.white,
                  size: 38,
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'AI Team OS',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                '企业智能运营工作台',
                style: TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const SizedBox(height: 30),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StartupErrorScreen extends StatelessWidget {
  const _StartupErrorScreen({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.shield_outlined,
                        size: 48,
                        color: Color(0xFFDC2626),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        '安全配置尚未完成',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        message,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 22),
                      FilledButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('重新检查'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
