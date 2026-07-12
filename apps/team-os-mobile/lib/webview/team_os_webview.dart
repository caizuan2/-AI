import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../auth/session_policy.dart';
import '../auth/team_role.dart';
import '../core/app_config.dart';
import '../notifications/notification_context.dart';
import '../settings/settings_sheet.dart';
import 'navigation_policy.dart';

class TeamOsWebView extends StatefulWidget {
  const TeamOsWebView({
    required this.config,
    required this.webViewEnvironment,
    super.key,
  });

  final AppConfig config;
  final WebViewEnvironment? webViewEnvironment;

  @override
  State<TeamOsWebView> createState() => _TeamOsWebViewState();
}

class _TeamOsWebViewState extends State<TeamOsWebView> {
  InAppWebViewController? _controller;
  late final TeamOsNavigationPolicy _navigationPolicy;
  NotificationContext _notificationContext =
      const NotificationContext.initial();
  Timer? _notificationTimer;
  Uri? _currentUri;
  String? _pageError;
  double _progress = 0;
  bool _authenticated = false;
  bool _roleEntryApplied = false;
  bool _recoveringBlockedNavigation = false;
  int _webViewEpoch = 0;
  late Uri _webViewInitialUri;

  String get _bridgeOriginPattern =>
      defaultTargetPlatform == TargetPlatform.android
      ? widget.config.baseUri.origin
      : widget.config.exactOriginPattern;

  @override
  void initState() {
    super.initState();
    _navigationPolicy = TeamOsNavigationPolicy(widget.config);
    _webViewInitialUri = SessionPolicy.initialUri(widget.config);
  }

  @override
  void dispose() {
    _notificationTimer?.cancel();
    super.dispose();
  }

  InAppWebViewSettings get _settings => InAppWebViewSettings(
    javaScriptEnabled: true,
    useShouldOverrideUrlLoading: true,
    supportMultipleWindows: false,
    mediaPlaybackRequiresUserGesture: true,
    allowFileAccess: false,
    allowContentAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    mixedContentMode: MixedContentMode.MIXED_CONTENT_NEVER_ALLOW,
    isInspectable: kDebugMode,
    useOnDownloadStart: true,
    thirdPartyCookiesEnabled: false,
    userAgent: 'AI-Team-OS-App/0.1.0',
    regexToAllowSyncUrlLoading: defaultTargetPlatform == TargetPlatform.android
        ? widget.config.allowedMainFramePattern
        : null,
    javaScriptHandlersOriginAllowList: {widget.config.exactOriginPattern},
    javaScriptHandlersForMainFrameOnly: true,
    javaScriptBridgeOriginAllowList: {_bridgeOriginPattern},
    javaScriptBridgeForMainFrameOnly: true,
  );

  Future<void> _syncNativeContext() async {
    if (!_authenticated || _controller == null) return;
    final uri = _currentUri;
    if (uri == null || !widget.config.isSameOrigin(uri)) return;
    try {
      await _controller!.evaluateJavascript(
        source: NotificationContext.syncScript,
      );
    } catch (_) {
      // The UI keeps its last verified server context when a refresh fails.
    }
  }

  void _startNotificationSync() {
    _notificationTimer?.cancel();
    _notificationTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => unawaited(_syncNativeContext()),
    );
  }

  void _handleBridge(List<dynamic> arguments) {
    final next = NotificationContext.fromBridgeArguments(arguments);
    if (next == null || !mounted) return;
    final shouldApplyEntry =
        !_roleEntryApplied &&
        next.role != TeamRole.unknown &&
        _currentUri?.path == '/team-os';
    setState(() {
      _notificationContext = next;
      if (shouldApplyEntry) _roleEntryApplied = true;
    });
    if (shouldApplyEntry) {
      unawaited(_loadPath(next.role.entryPath));
    }
  }

  void _updateLocation(WebUri? webUri, {required bool completed}) {
    if (webUri == null) return;
    final uri = Uri.tryParse(webUri.toString());
    if (uri == null || !widget.config.isSameOrigin(uri)) return;
    final authenticated = SessionPolicy.isTeamOsPath(uri.path);
    final login = SessionPolicy.isLoginPath(uri.path);

    _recoveringBlockedNavigation = false;

    if (mounted) {
      setState(() {
        _currentUri = uri;
        _authenticated = authenticated;
        if (login) {
          _notificationContext = const NotificationContext.initial();
          _roleEntryApplied = false;
        }
        _pageError = null;
      });
    }

    if (authenticated && completed) {
      _startNotificationSync();
      unawaited(_syncNativeContext());
    } else if (!authenticated) {
      _notificationTimer?.cancel();
    }
  }

  void _observeMainFrameNavigation(
    InAppWebViewController controller,
    WebUri? webUri, {
    required bool completed,
  }) {
    if (!identical(controller, _controller)) return;
    final uri = webUri == null ? null : Uri.tryParse(webUri.toString());
    if (!_navigationPolicy.allows(uri, isMainFrame: true)) {
      _recoverFromBlockedNavigation(controller);
      return;
    }
    _updateLocation(webUri, completed: completed);
  }

  void _recoverFromBlockedNavigation(InAppWebViewController controller) {
    if (_recoveringBlockedNavigation) return;
    _recoveringBlockedNavigation = true;
    _notificationTimer?.cancel();
    if (mounted) {
      setState(() {
        _authenticated = false;
        _currentUri = null;
        _notificationContext = const NotificationContext.initial();
        _roleEntryApplied = false;
      });
      _showBlockedNavigation();
    }
    unawaited(() async {
      try {
        await controller.stopLoading();
        await _loadPath('/team-os');
      } catch (_) {
        if (mounted) {
          setState(() {
            _pageError = '已阻止不安全导航，请重新加载企业工作台。';
          });
        }
      }
    }());
  }

  Future<void> _loadPath(String path) async {
    final controller = _controller;
    if (controller == null) return;
    await controller.loadUrl(
      urlRequest: URLRequest(
        url: WebUri(widget.config.resolve(path).toString()),
      ),
    );
  }

  void _retry() {
    final retryUri = _currentUri;
    _notificationTimer?.cancel();
    setState(() {
      _controller = null;
      _authenticated = false;
      _currentUri = null;
      _notificationContext = const NotificationContext.initial();
      _roleEntryApplied = false;
      _recoveringBlockedNavigation = false;
      _pageError = null;
      _progress = 0;
      _webViewInitialUri = _navigationPolicy.allows(retryUri, isMainFrame: true)
          ? retryUri!
          : SessionPolicy.initialUri(widget.config);
      _webViewEpoch += 1;
    });
  }

  Future<void> _logout() async {
    final controller = _controller;
    if (controller == null) return;
    var serverSessionInvalidated = false;
    try {
      final result = await controller
          .callAsyncJavaScript(functionBody: SessionPolicy.logoutFunctionBody)
          .timeout(const Duration(seconds: 10));
      serverSessionInvalidated = result?.error == null && result?.value == true;
    } catch (_) {
      // Local cookie removal below can still protect this device session.
    }
    var localSessionRemoved = false;
    try {
      final cookieManager = CookieManager.instance(
        webViewEnvironment: widget.webViewEnvironment,
      );
      localSessionRemoved = await cookieManager.deleteCookie(
        url: WebUri(widget.config.baseUri.toString()),
        name: SessionPolicy.cookieName,
        path: '/',
        webViewController: controller,
      );
      if (defaultTargetPlatform == TargetPlatform.android) {
        await cookieManager.flush();
      }
    } catch (_) {
      // A confirmed server logout still invalidates the opaque session.
    }
    if (!serverSessionInvalidated && !localSessionRemoved) {
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(const SnackBar(content: Text('退出失败，请检查网络后重试。')));
      }
      return;
    }
    if (!mounted) return;
    _notificationTimer?.cancel();
    setState(() {
      _controller = null;
      _authenticated = false;
      _currentUri = null;
      _notificationContext = const NotificationContext.initial();
      _roleEntryApplied = false;
      _recoveringBlockedNavigation = false;
      _pageError = null;
      _progress = 0;
      _webViewInitialUri = widget.config.resolve('/login?next=/team-os');
      _webViewEpoch += 1;
    });
    if (!serverSessionInvalidated && mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('本机已安全退出；服务器会话未确认失效。')));
    }
  }

  Future<void> _showSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: false,
      builder: (context) => TeamOsSettingsSheet(
        config: widget.config,
        role: _notificationContext.role,
        unreadCount: _notificationContext.unreadCount,
        onLogout: _logout,
      ),
    );
  }

  void _showBlockedNavigation() {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('已阻止离开 AI Team OS 安全域的导航。')));
  }

  Future<bool> _handleSystemBack() async {
    if (!_authenticated) return true;
    final controller = _controller;
    if (controller != null && await controller.canGoBack()) {
      await controller.goBack();
      return false;
    }
    return true;
  }

  int get _selectedIndex {
    final path = _currentUri?.path ?? '';
    if (path.startsWith('/team-os/notifications')) return 1;
    if (path.startsWith('/team-os/ai-coach')) return 2;
    return 0;
  }

  void _selectDestination(int index) {
    if (index == 3) {
      unawaited(_showSettings());
      return;
    }
    final routes = [
      _notificationContext.role.entryPath,
      '/team-os/notifications',
      '/team-os/ai-coach',
    ];
    unawaited(_loadPath(routes[index]));
  }

  @override
  Widget build(BuildContext context) {
    final webView = _buildWebView();

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final canExit = await _handleSystemBack();
        if (canExit && context.mounted) Navigator.of(context).maybePop();
      },
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 16,
          title: Row(
            children: [
              const Icon(Icons.hub_rounded, size: 24),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'AI Team OS',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  Text(
                    _authenticated
                        ? '${_notificationContext.role.label}工作台'
                        : '企业安全登录',
                    style: const TextStyle(fontSize: 11, color: Colors.white70),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            if (_authenticated)
              _UnreadButton(
                count: _notificationContext.unreadCount,
                onPressed: () => _loadPath('/team-os/notifications'),
              ),
            IconButton(
              tooltip: '刷新',
              onPressed: _controller == null ? null : _retry,
              icon: const Icon(Icons.refresh_rounded),
            ),
            if (_authenticated)
              IconButton(
                tooltip: 'APP 设置',
                onPressed: _showSettings,
                icon: const Icon(Icons.settings_outlined),
              ),
            const SizedBox(width: 4),
          ],
          bottom: _progress > 0 && _progress < 1
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(value: _progress),
                )
              : null,
        ),
        body: LayoutBuilder(
          builder: (context, constraints) {
            if (!_authenticated) return webView;
            if (constraints.maxWidth >= 980) {
              return Row(
                children: [
                  NavigationRail(
                    selectedIndex: _selectedIndex,
                    onDestinationSelected: _selectDestination,
                    labelType: NavigationRailLabelType.all,
                    destinations: const [
                      NavigationRailDestination(
                        icon: Icon(Icons.dashboard_outlined),
                        selectedIcon: Icon(Icons.dashboard_rounded),
                        label: Text('工作台'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.notifications_none_rounded),
                        selectedIcon: Icon(Icons.notifications_rounded),
                        label: Text('消息'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.psychology_outlined),
                        selectedIcon: Icon(Icons.psychology_rounded),
                        label: Text('AI 助手'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.settings_outlined),
                        selectedIcon: Icon(Icons.settings_rounded),
                        label: Text('设置'),
                      ),
                    ],
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: webView),
                ],
              );
            }
            return webView;
          },
        ),
        bottomNavigationBar: _authenticated
            ? LayoutBuilder(
                builder: (context, constraints) => constraints.maxWidth < 980
                    ? NavigationBar(
                        selectedIndex: _selectedIndex,
                        onDestinationSelected: _selectDestination,
                        destinations: const [
                          NavigationDestination(
                            icon: Icon(Icons.dashboard_outlined),
                            selectedIcon: Icon(Icons.dashboard_rounded),
                            label: '工作台',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.notifications_none_rounded),
                            selectedIcon: Icon(Icons.notifications_rounded),
                            label: '消息',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.psychology_outlined),
                            selectedIcon: Icon(Icons.psychology_rounded),
                            label: 'AI 助手',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.settings_outlined),
                            selectedIcon: Icon(Icons.settings_rounded),
                            label: '设置',
                          ),
                        ],
                      )
                    : const SizedBox.shrink(),
              )
            : null,
      ),
    );
  }

  Widget _buildWebView() {
    if (_pageError != null) {
      return _WebErrorState(message: _pageError!, onRetry: _retry);
    }

    return InAppWebView(
      key: ValueKey(_webViewEpoch),
      webViewEnvironment: widget.webViewEnvironment,
      initialUrlRequest: URLRequest(url: WebUri(_webViewInitialUri.toString())),
      initialSettings: _settings,
      onWebViewCreated: (controller) {
        _controller = controller;
        controller.addJavaScriptHandler(
          handlerName: NotificationContext.bridgeHandler,
          callback: (arguments) {
            if (!identical(controller, _controller)) return null;
            final uri = _currentUri;
            if (uri != null &&
                widget.config.isSameOrigin(uri) &&
                SessionPolicy.isTeamOsPath(uri.path)) {
              _handleBridge(arguments);
            }
            return null;
          },
        );
        setState(() {});
      },
      onLoadStart: (controller, url) {
        if (!identical(controller, _controller)) return;
        setState(() => _progress = 0.08);
        _observeMainFrameNavigation(controller, url, completed: false);
      },
      onLoadStop: (controller, url) {
        if (!identical(controller, _controller)) return;
        setState(() => _progress = 1);
        _observeMainFrameNavigation(controller, url, completed: true);
      },
      onUpdateVisitedHistory: (controller, url, isReload) {
        _observeMainFrameNavigation(controller, url, completed: false);
      },
      onProgressChanged: (controller, progress) {
        if (identical(controller, _controller) && mounted) {
          setState(() => _progress = progress / 100);
        }
      },
      shouldOverrideUrlLoading: (controller, action) async {
        if (!identical(controller, _controller)) {
          return NavigationActionPolicy.CANCEL;
        }
        final rawUrl = action.request.url?.toString();
        final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
        if (_navigationPolicy.allows(uri, isMainFrame: action.isForMainFrame)) {
          return NavigationActionPolicy.ALLOW;
        }
        if (action.isForMainFrame) {
          _recoverFromBlockedNavigation(controller);
        } else {
          _showBlockedNavigation();
        }
        return NavigationActionPolicy.CANCEL;
      },
      onCreateWindow: (controller, action) async => false,
      onDownloadStarting: (controller, request) {
        _showBlockedNavigation();
        return DownloadStartResponse(
          action: DownloadStartResponseAction.CANCEL,
          handled: true,
        );
      },
      onPermissionRequest: (controller, request) async => PermissionResponse(
        resources: request.resources,
        action: PermissionResponseAction.DENY,
      ),
      onReceivedServerTrustAuthRequest: (controller, challenge) async =>
          ServerTrustAuthResponse(action: ServerTrustAuthResponseAction.CANCEL),
      onReceivedError: (controller, request, error) {
        if (identical(controller, _controller) &&
            request.isForMainFrame == true &&
            !_recoveringBlockedNavigation &&
            mounted) {
          setState(() {
            _pageError = '企业服务暂时无法连接，请检查网络后重试。';
          });
        }
      },
    );
  }
}

class _UnreadButton extends StatelessWidget {
  const _UnreadButton({required this.count, required this.onPressed});

  final int count;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return IconButton(
      tooltip: count > 0 ? '$count 条未读消息' : '消息中心',
      onPressed: onPressed,
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text(label),
        child: const Icon(Icons.notifications_none_rounded),
      ),
    );
  }
}

class _WebErrorState extends StatelessWidget {
  const _WebErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.cloud_off_outlined,
                size: 52,
                color: Color(0xFF64748B),
              ),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('重新加载'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
