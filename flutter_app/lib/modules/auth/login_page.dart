import 'package:flutter/material.dart';

import '../../core/api/api_service.dart';
import '../chat/chat_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({
    required this.apiService,
    super.key,
  });

  static const routeName = '/login';

  final ApiService apiService;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _licenseController = TextEditingController();
  bool _loading = false;
  bool _activating = false;
  bool _registerMode = false;
  bool _activationMode = false;
  String? _error;
  LicenseStatusResult? _licenseStatus;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _licenseController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    final name = _nameController.text.trim();
    if (phone.isEmpty || password.isEmpty || (_registerMode && name.isEmpty)) {
      setState(() => _error = _registerMode ? '请输入昵称、用户名和密码。' : '请输入用户名和密码。');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      late final Map<String, dynamic> result;
      if (_registerMode) {
        result = await widget.apiService.register(
          phone: phone,
          password: password,
          name: name,
        );
        if (!mounted) {
          return;
        }
        _showActivation(
          const LicenseStatusResult(
            status: LicenseStatus.inactive,
            message: '账号注册成功，请输入超级管理员发放的卡密完成激活。',
          ),
        );
      } else {
        result = await widget.apiService.login(
          phone: phone,
          password: password,
        );
        final licenseStatus =
            await widget.apiService.licenseStatus(authData: result);
        if (!mounted) {
          return;
        }
        if (licenseStatus.canEnterApp) {
          _openChat();
          return;
        }
        _showActivation(licenseStatus);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = _formatSubmitError(error));
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  String _formatSubmitError(Object error) {
    if (error is! ApiException) {
      return error.toString();
    }

    final apiBaseUrl = widget.apiService.baseUrl;
    final details = error.debugDetails?.trim();
    final showEndpoint =
        apiBaseUrl.contains('127.0.0.1') || apiBaseUrl.contains('localhost');
    const localStartHint =
        '请确认本地 3051 服务是通过 scripts/start-user-local-3051.ps1 启动的。';
    if (details != null && details.isNotEmpty) {
      return showEndpoint
          ? '${error.message}\n当前接口：$apiBaseUrl\n$details\n$localStartHint'
          : '${error.message}\n当前接口：$apiBaseUrl\n$details';
    }
    if (showEndpoint) {
      return '${error.message}\n当前接口：$apiBaseUrl\n$localStartHint';
    }
    return error.message;
  }

  Future<void> _activateLicense() async {
    final licenseKey = _licenseController.text.trim();
    if (licenseKey.isEmpty) {
      setState(() {
        _licenseStatus = const LicenseStatusResult(
          status: LicenseStatus.invalid,
          message: '请输入卡密',
        );
      });
      return;
    }

    setState(() {
      _activating = true;
      _error = null;
      _licenseStatus = const LicenseStatusResult(
        status: LicenseStatus.checking,
        message: '正在验证卡密...',
      );
    });

    try {
      final result = await widget.apiService.activateLicense(licenseKey);
      if (!mounted) {
        return;
      }
      if (result.canEnterApp) {
        _licenseController.clear();
        _openChat();
        return;
      }
      setState(() => _licenseStatus = result);
    } catch (error) {
      if (mounted) {
        setState(() {
          _licenseStatus = LicenseStatusResult(
            status: LicenseStatus.serviceUnavailable,
            message: error.toString(),
          );
        });
      }
    } finally {
      if (mounted) {
        setState(() => _activating = false);
      }
    }
  }

  void _showActivation(LicenseStatusResult status) {
    setState(() {
      _activationMode = true;
      _licenseStatus = status;
      _error = null;
      _loading = false;
    });
  }

  void _backToLogin() {
    setState(() {
      _activationMode = false;
      _licenseStatus = null;
      _error = null;
      _activating = false;
    });
  }

  void _openChat() {
    Navigator.of(context).pushReplacementNamed(ChatPage.routeName);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  side: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    child: _activationMode
                        ? _ActivationForm(
                            key: const ValueKey('activation'),
                            controller: _licenseController,
                            loading: _activating,
                            status: _licenseStatus,
                            apiBaseUrl: widget.apiService.baseUrl,
                            onActivate: _activateLicense,
                            onBackToLogin: _backToLogin,
                          )
                        : _LoginForm(
                            key: const ValueKey('login'),
                            registerMode: _registerMode,
                            loading: _loading,
                            error: _error,
                            apiBaseUrl: widget.apiService.baseUrl,
                            phoneController: _phoneController,
                            passwordController: _passwordController,
                            nameController: _nameController,
                            onSubmit: _submit,
                            onToggleMode: () => setState(
                              () => _registerMode = !_registerMode,
                            ),
                          ),
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

class _LoginForm extends StatelessWidget {
  const _LoginForm({
    required this.registerMode,
    required this.loading,
    required this.apiBaseUrl,
    required this.phoneController,
    required this.passwordController,
    required this.nameController,
    required this.onSubmit,
    required this.onToggleMode,
    this.error,
    super.key,
  });

  final bool registerMode;
  final bool loading;
  final String apiBaseUrl;
  final String? error;
  final TextEditingController phoneController;
  final TextEditingController passwordController;
  final TextEditingController nameController;
  final VoidCallback onSubmit;
  final VoidCallback onToggleMode;

  @override
  Widget build(BuildContext context) {
    final showLocalEndpoint =
        apiBaseUrl.contains('127.0.0.1') || apiBaseUrl.contains('localhost');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          registerMode ? '创建账号' : '登录 AI 知识库',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        const Text('使用服务端账号体系，登录后需通过超级管理员卡密激活。'),
        if (showLocalEndpoint) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Text(
              '当前测试接口：$apiBaseUrl',
              style: const TextStyle(
                color: Color(0xFF475569),
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        if (registerMode) ...[
          TextField(
            controller: nameController,
            decoration: const InputDecoration(
              labelText: '昵称',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: phoneController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: '用户名 / 手机号',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: passwordController,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: '密码',
            border: OutlineInputBorder(),
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 12),
          Text(error!, style: const TextStyle(color: Colors.red)),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: loading ? null : onSubmit,
          child: Text(
            loading ? '处理中...' : (registerMode ? '注册并激活' : '登录'),
          ),
        ),
        TextButton(
          onPressed: loading ? null : onToggleMode,
          child: Text(registerMode ? '已有账号，去登录' : '没有账号，去注册'),
        ),
      ],
    );
  }
}

class _ActivationForm extends StatelessWidget {
  const _ActivationForm({
    required this.controller,
    required this.loading,
    required this.apiBaseUrl,
    required this.onActivate,
    required this.onBackToLogin,
    this.status,
    super.key,
  });

  final TextEditingController controller;
  final bool loading;
  final String apiBaseUrl;
  final LicenseStatusResult? status;
  final VoidCallback onActivate;
  final VoidCallback onBackToLogin;

  @override
  Widget build(BuildContext context) {
    final status = this.status;
    final showLocalEndpoint =
        apiBaseUrl.contains('127.0.0.1') || apiBaseUrl.contains('localhost');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.verified_user_outlined,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '卡密激活',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          '请输入超级管理员后台生成的卡密，激活后即可使用小董AI。',
          style: TextStyle(color: Color(0xFF475569), height: 1.5),
        ),
        if (showLocalEndpoint) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Text(
              '当前测试接口：$apiBaseUrl',
              style: const TextStyle(
                color: Color(0xFF475569),
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
        const SizedBox(height: 20),
        TextField(
          controller: controller,
          enabled: !loading,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) {
            if (!loading) {
              onActivate();
            }
          },
          decoration: const InputDecoration(
            labelText: '请输入卡密',
            helperText: '卡密由超级管理员后台发放，其他来源卡密无效。',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.key_outlined),
          ),
        ),
        if (status != null) ...[
          const SizedBox(height: 14),
          _LicenseStatusBanner(status: status),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: loading ? null : onActivate,
          icon: loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.lock_open_outlined),
          label: Text(loading ? '正在验证卡密...' : '立即激活'),
        ),
        TextButton(
          onPressed: loading ? null : onBackToLogin,
          child: const Text('返回登录'),
        ),
      ],
    );
  }
}

class _LicenseStatusBanner extends StatelessWidget {
  const _LicenseStatusBanner({required this.status});

  final LicenseStatusResult status;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(status.status);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_statusIcon(status.status), size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              status.message,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _statusColor(LicenseStatus status) {
    return switch (status) {
      LicenseStatus.active => const Color(0xFF059669),
      LicenseStatus.checking => const Color(0xFF2563EB),
      LicenseStatus.inactive => const Color(0xFF475569),
      LicenseStatus.serviceUnavailable => const Color(0xFFB45309),
      _ => const Color(0xFFDC2626),
    };
  }

  IconData _statusIcon(LicenseStatus status) {
    return switch (status) {
      LicenseStatus.active => Icons.check_circle_outline,
      LicenseStatus.checking => Icons.sync,
      LicenseStatus.inactive => Icons.info_outline,
      LicenseStatus.serviceUnavailable => Icons.support_agent_outlined,
      _ => Icons.error_outline,
    };
  }
}
