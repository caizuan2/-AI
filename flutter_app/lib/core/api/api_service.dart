import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../storage/session_store.dart';
import '../../modules/upload/upload_models.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiService {
  static const supportedChatModels = ['gpt', 'deepseek', 'qwen'];

  ApiService({
    required this.baseUrl,
    this.mockMode = false,
    this.sessionStore,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final bool mockMode;
  final SessionStore? sessionStore;
  final http.Client _client;
  String? _cookie;

  Future<void> restoreSession() async {
    _cookie = await sessionStore?.loadCookie();
  }

  Uri _uri(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return Uri.parse(path);
    }

    final normalizedBase = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
    final normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    return Uri.parse(normalizedBase).resolve(normalizedPath);
  }

  Map<String, String> _headers({bool json = true}) {
    return {
      if (json) 'Content-Type': 'application/json',
      if (_cookie != null) 'Cookie': _cookie!,
    };
  }

  void _captureCookie(http.BaseResponse response) {
    final setCookie = response.headers['set-cookie'];
    if (setCookie == null || setCookie.trim().isEmpty) {
      return;
    }

    _cookie = setCookie.split(';').first;
    final cookie = _cookie;
    if (cookie != null && sessionStore != null) {
      unawaited(sessionStore!.saveCookie(cookie));
    }
  }

  Object? _jsonBody(http.Response response) {
    if (response.body.trim().isEmpty) {
      return null;
    }

    return jsonDecode(response.body);
  }

  Map<String, dynamic> _asMap(Object? value) {
    if (value is Map<String, dynamic>) {
      return value;
    }

    if (value is Map) {
      return value.map((key, item) => MapEntry(key?.toString() ?? '', item));
    }

    return <String, dynamic>{};
  }

  String _messageFromEnvelope(Map<String, dynamic> envelope, String fallback) {
    final error = envelope['error'];
    if (error is Map && error['message'] is String) {
      return error['message'] as String;
    }
    if (error is String && error.isNotEmpty) {
      return error;
    }
    if (envelope['message'] is String) {
      return envelope['message'] as String;
    }
    return fallback;
  }

  Map<String, dynamic> _unwrap(http.Response response) {
    _captureCookie(response);
    final envelope = _asMap(_jsonBody(response));
    final ok = envelope['ok'] == true || envelope['success'] == true;

    if (response.statusCode < 200 || response.statusCode >= 300 || !ok) {
      throw ApiException(
        _messageFromEnvelope(envelope, 'Request failed.'),
        statusCode: response.statusCode,
      );
    }

    return _asMap(envelope['data'] ?? envelope);
  }

  Future<Map<String, dynamic>> _postJson(String path, Map<String, dynamic> body) async {
    final response = await _client.post(
      _uri(path),
      headers: _headers(),
      body: jsonEncode(body),
    );
    return _unwrap(response);
  }

  Future<Map<String, dynamic>> _getJson(String path) async {
    final response = await _client.get(
      _uri(path),
      headers: _headers(json: false),
    );
    return _unwrap(response);
  }

  Future<Map<String, dynamic>> login({
    required String phone,
    required String password,
  }) async {
    if (mockMode) {
      await _mockDelay();
      _cookie = 'mock-session=1';
      return {
        'user': {
          'id': 'mock-user',
          'phone': phone,
          'name': phone.isEmpty ? '本地演示用户' : phone,
        },
        'licenseActivated': true,
      };
    }

    return _postJson('/api/auth/login', {
      'phone': phone,
      'password': password,
    });
  }

  Future<Map<String, dynamic>> register({
    required String phone,
    required String password,
    required String name,
  }) async {
    if (mockMode) {
      await _mockDelay();
      _cookie = 'mock-session=1';
      return {
        'user': {
          'id': 'mock-user',
          'phone': phone,
          'name': name.isEmpty ? '本地演示用户' : name,
        },
        'licenseActivated': true,
      };
    }

    return _postJson('/api/auth/register', {
      'phone': phone,
      'password': password,
      'name': name,
    });
  }

  Future<Map<String, dynamic>> redeemLicense(String licenseKey) {
    if (mockMode) {
      return Future.value({
        'license': {
          'key': licenseKey,
          'status': 'active',
        },
      });
    }

    return _postJson('/api/license/redeem', {
      'licenseKey': licenseKey,
    });
  }

  Future<Map<String, dynamic>> currentUser() {
    if (mockMode) {
      return Future.value({
        'user': {
          'id': 'mock-user',
          'name': '本地演示用户',
        },
      });
    }

    return _getJson('/api/auth/me');
  }

  Future<Map<String, dynamic>> chat({
    required String text,
    String? conversationId,
    String model = 'gpt',
    String mode = 'fast',
    bool enableDeepThinking = false,
    bool enableWebSearch = false,
    List<Map<String, dynamic>> attachments = const [],
    List<Map<String, String>> contextMessages = const [],
    void Function(String token)? onToken,
    bool Function()? shouldStop,
  }) async {
    final selectedModel = supportedChatModels.contains(model) ? model : 'gpt';

    if (mockMode) {
      await _mockDelay();
      final answer = _mockChatAnswer(
        text: text,
        model: selectedModel,
        contextMessages: contextMessages,
      );
      await _emitTokens(answer, onToken, shouldStop: shouldStop);
      return {
        'conversation_id': conversationId ?? 'mock-conversation',
        'answer': answer,
      };
    }

    final result = await _postJson('/api/ai/chat/ask', {
      'text': text,
      'conversation_id': conversationId,
      'mode': mode,
      'enable_deep_thinking': enableDeepThinking,
      'enable_web_search': enableWebSearch,
      'attachments': attachments,
    });
    await _emitTokens(_answerFrom(result), onToken, shouldStop: shouldStop);
    return result;
  }

  Future<Map<String, dynamic>> upload(UploadFile file) async {
    if (mockMode) {
      await _mockDelay();
      return {
        'attachment': {
          'name': file.name,
          'size': file.bytes.length,
          'mimeType': file.mimeType,
        },
      };
    }

    final request = http.MultipartRequest(
      'POST',
      _uri('/api/ai/chat/attachments'),
    );
    if (_cookie != null) {
      request.headers['Cookie'] = _cookie!;
    }

    request.files.add(http.MultipartFile.fromBytes(
      'file',
      file.bytes,
      filename: file.name,
    ));
    request.files.add(http.MultipartFile.fromBytes(
      'attachment',
      file.bytes,
      filename: file.name,
    ));

    final streamed = await _client.send(request);
    _captureCookie(streamed);
    final response = await http.Response.fromStream(streamed);
    return _unwrap(response);
  }

  void dispose() {
    _client.close();
  }

  Future<void> _mockDelay() {
    return Future<void>.delayed(const Duration(milliseconds: 450));
  }

  Future<void> _emitTokens(
    String text,
    void Function(String token)? onToken, {
    bool Function()? shouldStop,
  }) async {
    if (onToken == null || text.isEmpty) {
      return;
    }

    final tokens = _streamTokens(text);

    for (var index = 0; index < tokens.length; index += 1) {
      if (shouldStop?.call() ?? false) {
        return;
      }
      final token = tokens[index];
      await Future<void>.delayed(_typingDelayFor(token, index));
      onToken(token);
    }
  }

  List<String> _streamTokens(String text) {
    final tokens = <String>[];
    final buffer = StringBuffer();

    for (final rune in text.runes) {
      final char = String.fromCharCode(rune);
      if (char == '\n') {
        if (buffer.isNotEmpty) {
          tokens.add(buffer.toString());
          buffer.clear();
        }
        tokens.add(char);
        continue;
      }

      if (RegExp(r'\s').hasMatch(char)) {
        buffer.write(char);
        tokens.add(buffer.toString());
        buffer.clear();
        continue;
      }

      if (RegExp(r'[\u4e00-\u9fff，。！？；：、（）《》]').hasMatch(char)) {
        if (buffer.isNotEmpty) {
          tokens.add(buffer.toString());
          buffer.clear();
        }
        tokens.add(char);
        continue;
      }

      buffer.write(char);
      if (buffer.length >= 3 || RegExp(r'[.,!?;:)\]}]').hasMatch(char)) {
        tokens.add(buffer.toString());
        buffer.clear();
      }
    }

    if (buffer.isNotEmpty) {
      tokens.add(buffer.toString());
    }

    return tokens;
  }

  Duration _typingDelayFor(String token, int index) {
    if (token == '\n') {
      return const Duration(milliseconds: 52);
    }
    final base = 30 + ((token.length + index) % 6) * 8;
    return Duration(milliseconds: base.clamp(30, 80).toInt());
  }

  String _mockChatAnswer({
    required String text,
    required String model,
    required List<Map<String, String>> contextMessages,
  }) {
    final modelName = switch (model) {
      'deepseek' => 'DeepSeek',
      'qwen' => 'Qwen',
      _ => 'GPT',
    };
    final contextCount = contextMessages.length;

    return '''
## 回答摘要

我已收到你的问题：**$text**。

当前模型结构：**$modelName**，本地上下文记忆：**$contextCount 条**。

下面是一个本地模拟的 GPT 级回复，用于验证 Flutter 原生聊天 UI 的 Markdown、列表、代码块和表格渲染。

### 建议步骤

1. 先确认用户目标。
2. 再拆分成可执行任务。
3. 最后输出可以直接使用的结果。

```dart
Future<String> generateAnswer(String question) async {
  final trimmed = question.trim();
  if (trimmed.isEmpty) {
    return '请先输入问题';
  }
  return 'AI 回复：\$trimmed';
}
```

| 能力 | 状态 |
| --- | --- |
| Markdown | 已启用 |
| 代码块复制 | 已启用 |
| 流式输出 | 已启用 |

切换真实接口：运行时添加 `--dart-define=USE_MOCK_API=false`。
''';
  }

  String _answerFrom(Map<String, dynamic> result) {
    for (final key in ['answer', 'finalAnswer', 'content', 'message']) {
      final value = result[key];
      if (value is String && value.trim().isNotEmpty) {
        return value;
      }
    }

    final aiMessage = result['aiMessage'];
    if (aiMessage is Map && aiMessage['content'] is String) {
      return aiMessage['content'] as String;
    }

    return '已收到服务端响应，但当前客户端暂未识别答案字段。';
  }
}
