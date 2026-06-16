import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../storage/session_store.dart';
import '../../modules/upload/upload_models.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.debugDetails});

  final String message;
  final int? statusCode;
  final String? debugDetails;

  @override
  String toString() => message;
}

class ApiService {
  static const supportedChatModels = ['gpt', 'deepseek', 'qwen'];
  static const _maxUploadSizeMb = 300;
  static const _uploadTimeout = Duration(minutes: 5);

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
  Map<String, dynamic>? _lastUser;

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

  String _contentType(http.Response response) {
    return response.headers['content-type'] ?? '';
  }

  String _bodyPreview(http.Response response, {int maxLength = 200}) {
    final text = response.body.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (text.length <= maxLength) {
      return text;
    }
    return '${text.substring(0, maxLength)}...';
  }

  void _debugApiResponseIssue(http.Response response, String message) {
    debugPrint(
      '$message\n'
      'url=${response.request?.url}\n'
      'status=${response.statusCode}\n'
      'content-type=${_contentType(response)}\n'
      'bodyPreview=${_bodyPreview(response)}',
    );
  }

  bool _looksLikeHtml(http.Response response) {
    final contentType = _contentType(response).toLowerCase();
    final body = response.body.trimLeft().toLowerCase();
    return contentType.contains('text/html') ||
        body.startsWith('<!doctype html') ||
        body.startsWith('<html');
  }

  Object? _jsonBody(http.Response response) {
    final body = response.body.trim();
    if (body.isEmpty) {
      return null;
    }

    if (_looksLikeHtml(response)) {
      _debugApiResponseIssue(
          response, 'API response was HTML instead of JSON.');
      throw ApiException(
        '服务器返回了网页，不是 API JSON，请检查 API 地址或后端部署。',
        statusCode: response.statusCode,
        debugDetails:
            'url=${response.request?.url}\nstatus=${response.statusCode}\ncontent-type=${_contentType(response)}\nbody=${_bodyPreview(response, maxLength: 300)}',
      );
    }

    try {
      return jsonDecode(response.body);
    } on FormatException catch (error) {
      _debugApiResponseIssue(
        response,
        'API response JSON parse failed: ${error.message}',
      );
      throw ApiException(
        '服务器返回的数据不是合法 JSON，请稍后重试。',
        statusCode: response.statusCode,
        debugDetails:
            'url=${response.request?.url}\nstatus=${response.statusCode}\ncontent-type=${_contentType(response)}\nbody=${_bodyPreview(response, maxLength: 300)}',
      );
    }
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

  List<dynamic> _asList(Object? value) {
    if (value is List) {
      return value;
    }

    return const [];
  }

  String _absoluteUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:')) {
      return trimmed;
    }

    if (!trimmed.startsWith('/')) {
      return trimmed;
    }

    return _uri(trimmed).toString();
  }

  Map<String, dynamic> _normalizeAttachmentUrls(Map<String, dynamic> value) {
    final normalized = Map<String, dynamic>.from(value);
    for (final key in const [
      'url',
      'publicUrl',
      'public_url',
      'fileUrl',
      'file_url',
      'downloadUrl',
      'download_url',
      'thumbnailUrl',
      'thumbnail_url',
      'src',
    ]) {
      final url = normalized[key];
      if (url is String && url.trim().isNotEmpty) {
        normalized[key] = _absoluteUrl(url);
      }
    }
    return normalized;
  }

  List<dynamic> _normalizeAttachmentList(Object? value) {
    return _asList(value).map((item) {
      if (item is Map<String, dynamic>) {
        return _normalizeAttachmentUrls(item);
      }
      if (item is Map) {
        return _normalizeAttachmentUrls(
          item.map((key, value) => MapEntry(key?.toString() ?? '', value)),
        );
      }
      return item;
    }).toList(growable: false);
  }

  Map<String, dynamic> _normalizeAttachmentEnvelope(Map<String, dynamic> data) {
    final normalized = Map<String, dynamic>.from(data);

    for (final key in const ['attachment', 'file']) {
      final value = normalized[key];
      if (value is Map<String, dynamic>) {
        normalized[key] = _normalizeAttachmentUrls(value);
      } else if (value is Map) {
        normalized[key] = _normalizeAttachmentUrls(
          value.map((itemKey, itemValue) =>
              MapEntry(itemKey?.toString() ?? '', itemValue)),
        );
      }
    }

    final nestedData = normalized['data'];
    if (nestedData is Map<String, dynamic>) {
      normalized['data'] = _normalizeAttachmentEnvelope(nestedData);
    } else if (nestedData is Map) {
      normalized['data'] = _normalizeAttachmentEnvelope(
        nestedData.map((key, value) => MapEntry(key?.toString() ?? '', value)),
      );
    }

    return normalized;
  }

  Map<String, dynamic> _normalizeAvatarEnvelope(Map<String, dynamic> data) {
    final normalized = Map<String, dynamic>.from(data);
    for (final key in const [
      'avatar',
      'avatarUrl',
      'avatar_url',
      'image',
      'url',
    ]) {
      final url = normalized[key];
      if (url is String && url.trim().isNotEmpty) {
        normalized[key] = _absoluteUrl(url);
      }
    }

    for (final key in const ['user', 'data']) {
      final value = normalized[key];
      if (value is Map<String, dynamic>) {
        normalized[key] = _normalizeAvatarEnvelope(value);
      } else if (value is Map) {
        normalized[key] = _normalizeAvatarEnvelope(
          value.map((itemKey, itemValue) =>
              MapEntry(itemKey?.toString() ?? '', itemValue)),
        );
      }
    }

    return normalized;
  }

  Map<String, dynamic> _normalizeHistoryAttachments(Map<String, dynamic> data) {
    final normalized = Map<String, dynamic>.from(data);
    final messages = _asList(normalized['messages']).map((item) {
      final message = _asMap(item);
      if (message.isEmpty) {
        return item;
      }
      return {
        ...message,
        if (message.containsKey('attachments'))
          'attachments': _normalizeAttachmentList(message['attachments']),
      };
    }).toList(growable: false);
    normalized['messages'] = messages;
    return normalized;
  }

  String _messageFromEnvelope(Map<String, dynamic> envelope, String fallback) {
    final code = envelope['code'];
    if (code == 'FILE_TOO_LARGE') {
      return '文件太大，单个附件不能超过 ${_maxUploadSizeMb}MB';
    }

    final error = envelope['error'];
    if (error is Map && error['message'] is String) {
      return error['message'] as String;
    }
    if (envelope['message'] is String) {
      return envelope['message'] as String;
    }
    if (error is String && error.isNotEmpty) {
      return error;
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

  Map<String, dynamic> _rememberUser(Map<String, dynamic> data) {
    final user = data['user'];
    if (user is Map<String, dynamic>) {
      _lastUser = user;
    } else if (user is Map) {
      _lastUser =
          user.map((key, value) => MapEntry(key?.toString() ?? '', value));
    } else if (data.containsKey('id') || data.containsKey('phone')) {
      _lastUser = data;
    }
    return data;
  }

  Future<Map<String, dynamic>> _postJson(
      String path, Map<String, dynamic> body) async {
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
      return _rememberUser({
        'user': {
          'id': 'mock-user',
          'phone': phone,
          'name': phone.isEmpty ? '当前用户' : phone,
        },
        'licenseActivated': true,
      });
    }

    return _rememberUser(await _postJson('/api/auth/login', {
      'phone': phone,
      'password': password,
    }));
  }

  Future<Map<String, dynamic>> register({
    required String phone,
    required String password,
    required String name,
  }) async {
    if (mockMode) {
      await _mockDelay();
      _cookie = 'mock-session=1';
      return _rememberUser({
        'user': {
          'id': 'mock-user',
          'phone': phone,
          'name': name.isEmpty ? '当前用户' : name,
        },
        'licenseActivated': true,
      });
    }

    return _rememberUser(await _postJson('/api/auth/register', {
      'phone': phone,
      'password': password,
      'name': name,
    }));
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
        'user': _lastUser ??
            {
              'id': 'mock-user',
              'name': '当前用户',
            },
      });
    }

    return _getJson('/api/auth/me').then(_rememberUser);
  }

  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) {
    if (mockMode) {
      return Future.value({'changed': true});
    }

    return _postJson('/api/auth/change-password', {
      'current_password': currentPassword,
      'new_password': newPassword,
      'confirm_password': confirmPassword,
    });
  }

  Future<Map<String, dynamic>> updateAvatar(UploadFile file) async {
    if (mockMode) {
      await _mockDelay();
      return {
        'avatar_url': 'mock-avatar://${file.name}',
      };
    }

    final request = http.MultipartRequest(
      'POST',
      _uri('/api/auth/avatar'),
    );
    request.headers['Accept'] = 'application/json';
    request.headers['User-Agent'] = 'ai-knowledge-flutter-avatar-uploader';
    if (_cookie != null) {
      request.headers['Cookie'] = _cookie!;
    }
    request.fields['mimeType'] = _guessUploadMimeType(file);
    request.fields['originalName'] = _safeUploadFilename(file, 'avatar.jpg');

    request.files.add(http.MultipartFile.fromBytes(
      'avatar',
      file.bytes,
      filename: _safeUploadFilename(file, 'avatar.jpg'),
    ));
    request.files.add(http.MultipartFile.fromBytes(
      'file',
      file.bytes,
      filename: _safeUploadFilename(file, 'avatar.jpg'),
    ));

    final response = await _sendUploadRequest(
      request,
      file,
      fallbackMessage: '头像上传失败，请稍后重试',
    );
    final debugDetails = _uploadDebugDetails(response, file);
    try {
      return _normalizeAvatarEnvelope(_unwrap(response));
    } on ApiException catch (error) {
      debugPrint('Avatar upload failed:\n$debugDetails');
      throw ApiException(
        error.message,
        statusCode: error.statusCode,
        debugDetails: error.debugDetails ?? debugDetails,
      );
    } catch (error) {
      debugPrint('Avatar upload failed:\n$debugDetails\nexception=$error');
      throw ApiException(
        '头像上传失败，请稍后重试',
        debugDetails: '$debugDetails\nexception=$error',
      );
    }
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
    String? localClientId,
    Map<String, dynamic> metadata = const {},
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
      'question': text,
      'text': text,
      'conversation_id': conversationId,
      'mode': mode,
      'enable_deep_thinking': enableDeepThinking,
      'enable_web_search': enableWebSearch,
      'attachments': attachments,
      if ((localClientId ?? '').trim().isNotEmpty)
        'localClientId': localClientId,
      if (metadata.isNotEmpty) 'metadata': metadata,
    });
    await _emitTokens(_answerFrom(result), onToken, shouldStop: shouldStop);
    return result;
  }

  Future<List<Map<String, dynamic>>> getConversations() async {
    if (mockMode) {
      return const [];
    }

    final data = await _getJson('/api/ai/chat/conversations');
    return _asList(data['conversations'])
        .whereType<Map>()
        .map((item) => item.map((key, value) => MapEntry('$key', value)))
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> getConversationHistory(
      String conversationId) async {
    if (mockMode) {
      return {
        'conversation': {
          'id': conversationId,
          'title': '本地模拟会话',
          'updated_at': DateTime.now().toIso8601String(),
        },
        'messages': const [],
      };
    }

    final encodedConversationId = Uri.encodeQueryComponent(conversationId);
    final data = await _getJson(
      '/api/ai/chat/history?conversation_id=$encodedConversationId',
    );
    return _normalizeHistoryAttachments(data);
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
    request.headers['Accept'] = 'application/json';
    request.headers['User-Agent'] = 'ai-knowledge-flutter-attachment-uploader';
    if (_cookie != null) {
      request.headers['Cookie'] = _cookie!;
    }
    request.fields['mimeType'] = _guessUploadMimeType(file);
    request.fields['originalName'] =
        _safeUploadFilename(file, 'attachment.bin');

    request.files.add(http.MultipartFile.fromBytes(
      'file',
      file.bytes,
      filename: _safeUploadFilename(file, 'attachment.bin'),
    ));

    final response = await _sendUploadRequest(
      request,
      file,
      fallbackMessage: '上传失败，请稍后重试',
    );
    final debugDetails = _uploadDebugDetails(response, file);
    try {
      return _normalizeAttachmentEnvelope(_unwrap(response));
    } on ApiException catch (error) {
      debugPrint('Attachment upload failed:\n$debugDetails');
      final message = error.statusCode == 413 || error.message.contains('不能超过')
          ? '文件太大，单个附件不能超过 ${_maxUploadSizeMb}MB'
          : error.message;
      throw ApiException(
        message,
        statusCode: error.statusCode,
        debugDetails: error.debugDetails ?? debugDetails,
      );
    } catch (error) {
      debugPrint('Attachment upload failed:\n$debugDetails\nexception=$error');
      throw ApiException(
        '上传失败，请稍后重试',
        debugDetails: '$debugDetails\nexception=$error',
      );
    }
  }

  String _uploadDebugDetails(http.Response response, UploadFile file) {
    return [
      'requestUrl=${response.request?.url}',
      'statusCode=${response.statusCode}',
      'contentType=${_contentType(response)}',
      'bodyPreview=${_bodyPreview(response, maxLength: 300)}',
      'fileName=${_safeUploadFilename(file, 'attachment.bin')}',
      'fileSize=${file.bytes.length}',
      'mimeType=${_guessUploadMimeType(file)}',
      'platform=$defaultTargetPlatform',
      'apiBaseUrl=$baseUrl',
      'useMockApi=$mockMode',
    ].join('\n');
  }

  Future<http.Response> _sendUploadRequest(
    http.MultipartRequest request,
    UploadFile file, {
    required String fallbackMessage,
  }) async {
    try {
      final streamed = await _client.send(request).timeout(_uploadTimeout);
      _captureCookie(streamed);
      return await http.Response.fromStream(streamed).timeout(_uploadTimeout);
    } on TimeoutException catch (error) {
      final details = _uploadExceptionDetails(request, file, error);
      debugPrint('Upload timed out:\n$details');
      throw ApiException(
        '上传超时，请检查网络后重试',
        debugDetails: details,
      );
    } catch (error) {
      final details = _uploadExceptionDetails(request, file, error);
      debugPrint('Upload connection failed:\n$details');
      throw ApiException(
        _isConnectionInterrupted(error) ? '上传连接中断，请重试' : fallbackMessage,
        debugDetails: details,
      );
    }
  }

  String _uploadExceptionDetails(
    http.MultipartRequest request,
    UploadFile file,
    Object error,
  ) {
    return [
      'requestUrl=${request.url}',
      'statusCode=NO_RESPONSE',
      'contentType=',
      'bodyPreview=',
      'fileName=${_safeUploadFilename(file, 'attachment.bin')}',
      'fileSize=${file.bytes.length}',
      'mimeType=${_guessUploadMimeType(file)}',
      'platform=$defaultTargetPlatform',
      'apiBaseUrl=$baseUrl',
      'useMockApi=$mockMode',
      'exception=$error',
    ].join('\n');
  }

  bool _isConnectionInterrupted(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('socketexception') ||
        text.contains('write failed') ||
        text.contains('connection reset') ||
        text.contains('connection closed') ||
        text.contains('forcibly closed') ||
        text.contains('远程主机强迫关闭');
  }

  String _safeUploadFilename(UploadFile file, String fallback) {
    final name = file.name.trim();
    return name.isEmpty ? fallback : name;
  }

  String _guessUploadMimeType(UploadFile file) {
    final explicit = file.mimeType?.trim().toLowerCase();
    if (explicit != null && explicit.isNotEmpty) {
      return explicit;
    }

    final name = file.name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (name.endsWith('.png')) {
      return 'image/png';
    }
    if (name.endsWith('.webp')) {
      return 'image/webp';
    }
    if (name.endsWith('.gif')) {
      return 'image/gif';
    }
    if (name.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (name.endsWith('.doc')) {
      return 'application/msword';
    }
    if (name.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (name.endsWith('.xls')) {
      return 'application/vnd.ms-excel';
    }
    if (name.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (name.endsWith('.ppt')) {
      return 'application/vnd.ms-powerpoint';
    }
    if (name.endsWith('.pptx')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (name.endsWith('.txt')) {
      return 'text/plain';
    }
    if (name.endsWith('.csv')) {
      return 'text/csv';
    }
    if (name.endsWith('.json')) {
      return 'application/json';
    }
    if (name.endsWith('.zip')) {
      return 'application/zip';
    }

    return 'application/octet-stream';
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
