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
  bool _registerMode = false;
  String? _error;

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
      if (_registerMode) {
        await widget.apiService.register(
          phone: phone,
          password: password,
          name: name,
        );
      } else {
        await widget.apiService.login(
          phone: phone,
          password: password,
        );
      }

      if (_licenseController.text.trim().isNotEmpty) {
        await widget.apiService.redeemLicense(_licenseController.text.trim());
      }

      if (!mounted) {
        return;
      }
      Navigator.of(context).pushReplacementNamed(ChatPage.routeName);
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _registerMode ? '创建账号' : '登录 AI 知识库',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text('使用现有后端账号体系，不改变登录、注册或卡密逻辑。'),
                      const SizedBox(height: 24),
                      if (_registerMode) ...[
                        TextField(
                          controller: _nameController,
                          decoration: const InputDecoration(
                            labelText: '昵称',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: '用户名 / 手机号',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: '密码',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _licenseController,
                        decoration: const InputDecoration(
                          labelText: '卡密（可选）',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ],
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _loading ? null : _submit,
                        child: Text(_loading ? '处理中...' : (_registerMode ? '注册并进入' : '登录')),
                      ),
                      TextButton(
                        onPressed: _loading
                            ? null
                            : () => setState(() => _registerMode = !_registerMode),
                        child: Text(_registerMode ? '已有账号，去登录' : '没有账号，去注册'),
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
