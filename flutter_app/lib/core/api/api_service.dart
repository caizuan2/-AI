import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../storage/session_store.dart';
import '../../modules/upload/upload_models.dart';
import 'conversation_actions.dart';

class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.statusCode,
    this.code,
    this.debugDetails,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final String? debugDetails;

  @override
  String toString() => message;
}

enum LicenseStatus {
  unknown,
  checking,
  active,
  inactive,
  expired,
  disabled,
  invalid,
  used,
  serviceUnavailable,
}

class LicenseStatusResult {
  const LicenseStatusResult({
    required this.status,
    required this.message,
    this.raw = const <String, dynamic>{},
  });

  final LicenseStatus status;
  final String message;
  final Map<String, dynamic> raw;

  bool get canEnterApp => status == LicenseStatus.active;
}

class ConversationFeatureKeys {
  static const share = conversationFeatureShareKey;
  static const groupChat = conversationFeatureGroupChatKey;
  static const rename = conversationFeatureRenameKey;
  static const archive = conversationFeatureArchiveKey;
  static const delete = conversationFeatureDeleteKey;
  static const pinCloudSync = conversationFeaturePinCloudSyncKey;

  static const all = <String>[
    share,
    groupChat,
    rename,
    archive,
    delete,
    pinCloudSync,
  ];
}

class ConversationFeatureFlags {
  const ConversationFeatureFlags({
    required this.values,
    this.loaded = false,
    this.message = '该功能暂未开放，请联系管理员开启。',
    this.source = '',
    this.statusCode,
    this.contentType = '',
    this.error,
  });

  const ConversationFeatureFlags.disabled({
    this.message = '该功能暂未开放，请联系管理员开启。',
    this.source = '',
    this.statusCode,
    this.contentType = '',
    this.error,
  })  : values = disabledValues,
        loaded = false;

  static const disabledValues = conversationFeatureDisabledValues;

  final Map<String, bool> values;
  final bool loaded;
  final String message;
  final String source;
  final int? statusCode;
  final String contentType;
  final String? error;

  bool isEnabled(String key) => values[key] == true;
}

class _ConversationFeatureHttpResult {
  const _ConversationFeatureHttpResult({
    required this.data,
    required this.statusCode,
    required this.contentType,
  });

  final Map<String, dynamic> data;
  final int statusCode;
  final String contentType;
}

class _ConversationFeatureLoadFailure implements Exception {
  const _ConversationFeatureLoadFailure({
    required this.source,
    required this.reason,
    this.statusCode,
    this.contentType = '',
  });

  final String source;
  final String reason;
  final int? statusCode;
  final String contentType;

  @override
  String toString() => reason;
}

class ApiService {
  static const supportedChatModels = ['gpt', 'deepseek', 'qwen'];
  static const _maxUploadSizeMb = 300;
  static const _uploadTimeout = Duration(minutes: 5);
  static const _conversationFeaturePath = '/api/user/conversation-features';
  static const _conversationFeatureTimeout = Duration(seconds: 8);
  static const _conversationActionTimeout = Duration(seconds: 15);

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

  Future<Map<String, dynamic>> _requestConversationAction({
    required String action,
    required String method,
    required String path,
    required String conversationId,
    Map<String, dynamic> body = const {},
    String unauthenticatedMessage = '请先登录后再操作',
    String forbiddenMessage = '无权限执行该操作',
    String notFoundMessage = '操作接口未部署',
    String methodNotAllowedMessage = '操作接口未接入',
    String timeoutMessage = '网络异常，请稍后重试',
    String invalidJsonMessage = '接口返回异常',
  }) async {
    debugPrint(
      '[conversation-action] $action start conversationId=$conversationId',
    );

    late final http.Response response;
    try {
      final uri = _uri(path);
      final headers = _headers(json: method != 'DELETE');
      response = switch (method) {
        'POST' => await _client
            .post(uri, headers: headers, body: jsonEncode(body))
            .timeout(_conversationActionTimeout),
        'PATCH' => await _client
            .patch(uri, headers: headers, body: jsonEncode(body))
            .timeout(_conversationActionTimeout),
        'DELETE' => await _client
            .delete(uri, headers: _headers(json: false))
            .timeout(_conversationActionTimeout),
        _ => throw const ApiException('操作接口未接入', statusCode: 405),
      };
    } on ApiException catch (error) {
      debugPrint(
        '[conversation-action] $action failed '
        'status=${error.statusCode ?? ''} reason=${error.message}',
      );
      rethrow;
    } on TimeoutException {
      debugPrint(
        '[conversation-action] $action failed status= reason=$timeoutMessage',
      );
      throw ApiException(timeoutMessage);
    } catch (error) {
      const message = '网络异常，请稍后重试';
      debugPrint(
        '[conversation-action] $action failed '
        'status= reason=$message detail=$error',
      );
      throw const ApiException(message);
    }

    debugPrint(
      '[conversation-action] $action response status=${response.statusCode}',
    );
    _captureCookie(response);

    late final Map<String, dynamic> envelope;
    try {
      envelope = _conversationActionEnvelope(
        response,
        strictJson: response.statusCode >= 200 && response.statusCode < 300,
        invalidJsonMessage: invalidJsonMessage,
      );
    } on ApiException catch (error) {
      debugPrint(
        '[conversation-action] $action failed '
        'status=${error.statusCode ?? response.statusCode} '
        'reason=${error.message}',
      );
      rethrow;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final reason = _conversationActionFailureMessage(
        response.statusCode,
        envelope,
        unauthenticatedMessage: unauthenticatedMessage,
        forbiddenMessage: forbiddenMessage,
        notFoundMessage: notFoundMessage,
        methodNotAllowedMessage: methodNotAllowedMessage,
      );
      debugPrint(
        '[conversation-action] $action failed '
        'status=${response.statusCode} '
        'code=${_conversationActionErrorCode(envelope)} '
        'reason=$reason',
      );
      final code = _conversationActionErrorCode(envelope);
      throw ApiException(
        reason,
        statusCode: response.statusCode,
        code: code.isEmpty ? null : code,
      );
    }

    if (envelope['ok'] == false || envelope['success'] == false) {
      final reason = _messageFromEnvelope(envelope, '操作失败，请稍后重试');
      debugPrint(
        '[conversation-action] $action failed '
        'status=${response.statusCode} '
        'code=${_conversationActionErrorCode(envelope)} '
        'reason=$reason',
      );
      final code = _conversationActionErrorCode(envelope);
      throw ApiException(
        reason,
        statusCode: response.statusCode,
        code: code.isEmpty ? null : code,
      );
    }

    final data = envelope['data'];
    debugPrint('[conversation-action] $action success');
    return data is Map ? _asMap(data) : envelope;
  }

  Map<String, dynamic> _conversationActionEnvelope(
    http.Response response, {
    required bool strictJson,
    required String invalidJsonMessage,
  }) {
    if (response.body.trim().isEmpty) {
      return <String, dynamic>{};
    }

    if (!strictJson && _looksLikeHtml(response)) {
      return <String, dynamic>{};
    }

    try {
      return _asMap(_jsonBody(response));
    } on ApiException catch (error) {
      if (!strictJson) {
        return <String, dynamic>{};
      }
      throw ApiException(
        invalidJsonMessage,
        statusCode: error.statusCode,
        debugDetails: error.debugDetails,
      );
    } catch (error) {
      if (!strictJson) {
        return <String, dynamic>{};
      }
      throw ApiException(
        invalidJsonMessage,
        statusCode: response.statusCode,
        debugDetails: error.toString(),
      );
    }
  }

  String _conversationActionFailureMessage(
    int statusCode,
    Map<String, dynamic> envelope, {
    required String unauthenticatedMessage,
    required String forbiddenMessage,
    required String notFoundMessage,
    required String methodNotAllowedMessage,
  }) {
    return conversationActionFailureMessage(
      statusCode,
      envelope,
      unauthenticatedMessage: unauthenticatedMessage,
      forbiddenMessage: forbiddenMessage,
      notFoundMessage: notFoundMessage,
      methodNotAllowedMessage: methodNotAllowedMessage,
    );
  }

  String _conversationActionErrorCode(Map<String, dynamic> envelope) {
    final topLevelCode = _conversationActionStringValue(envelope['code']);
    if (topLevelCode.isNotEmpty) {
      return topLevelCode;
    }
    final error = envelope['error'];
    if (error is Map) {
      final nestedCode = _conversationActionStringValue(error['code']);
      if (nestedCode.isNotEmpty) {
        return nestedCode;
      }
    }
    return '';
  }

  String _conversationActionStringValue(Object? value) {
    if (value is String) {
      return value.trim();
    }
    if (value is num || value is bool) {
      return value.toString();
    }
    return '';
  }

  String _conversationActionPath(String conversationId, String action) {
    final encodedId = Uri.encodeComponent(conversationId);
    return '/api/user/conversations/$encodedId/$action';
  }

  String _firstConversationActionUrl(
    Object? value,
    List<String> keys, {
    int depth = 0,
  }) {
    return extractConversationActionUrl(value, keys, depth: depth);
  }

  bool _isMissingConversationActionEndpoint(ApiException error) {
    return error.statusCode == 404 || error.statusCode == 405;
  }

  Future<_ConversationFeatureHttpResult> _getConversationFeatureJson(
    String path,
  ) async {
    debugPrint('[conversation-features] request start: $path');

    late final http.Response response;
    try {
      response = await _client
          .get(
            _uri(path),
            headers: _headers(json: false),
          )
          .timeout(_conversationFeatureTimeout);
    } on TimeoutException catch (error) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        reason: 'timeout: $error',
      );
    } catch (error) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        reason: error.toString(),
      );
    }

    _captureCookie(response);
    final contentType = _contentType(response);
    debugPrint(
        '[conversation-features] response status=${response.statusCode}');
    debugPrint('[conversation-features] response contentType=$contentType');

    late final Map<String, dynamic> envelope;
    try {
      envelope = _asMap(_jsonBody(response));
    } on ApiException catch (error) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        statusCode: response.statusCode,
        contentType: contentType,
        reason: error.message,
      );
    } catch (error) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        statusCode: response.statusCode,
        contentType: contentType,
        reason: error.toString(),
      );
    }

    final rawKeys = envelope.keys.map((key) => key.toString()).toList();
    debugPrint('[conversation-features] raw keys=${rawKeys.join(',')}');

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        statusCode: response.statusCode,
        contentType: contentType,
        reason: _messageFromEnvelope(envelope, 'Request failed.'),
      );
    }

    if (envelope['ok'] == false || envelope['success'] == false) {
      throw _ConversationFeatureLoadFailure(
        source: path,
        statusCode: response.statusCode,
        contentType: contentType,
        reason: _messageFromEnvelope(envelope, 'Request failed.'),
      );
    }

    final data = envelope['data'];
    return _ConversationFeatureHttpResult(
      data: data is Map ? _asMap(data) : envelope,
      statusCode: response.statusCode,
      contentType: contentType,
    );
  }

  Future<ConversationFeatureFlags> getConversationFeatureFlags() async {
    if (mockMode) {
      return const ConversationFeatureFlags.disabled();
    }

    try {
      final result = await _getConversationFeatureJson(
        _conversationFeaturePath,
      );
      final flags = _conversationFeatureFlagsFrom(
        result.data,
        source: _conversationFeaturePath,
        statusCode: result.statusCode,
        contentType: result.contentType,
      );
      _debugConversationFeatureFlags(flags);
      return flags;
    } on _ConversationFeatureLoadFailure catch (error) {
      debugPrint(
        '[conversation-features] load failed\n'
        'source=${error.source}\n'
        'status=${error.statusCode ?? ''}\n'
        'contentType=${error.contentType}\n'
        'reason=${error.reason}\n'
        'fallback=all disabled',
      );
      if (error.statusCode == 401 || error.statusCode == 403) {
        return ConversationFeatureFlags.disabled(
          message: '请先登录后再使用该功能。',
          source: error.source,
          statusCode: error.statusCode,
          contentType: error.contentType,
          error: error.reason,
        );
      }
      return ConversationFeatureFlags.disabled(
        source: error.source,
        statusCode: error.statusCode,
        contentType: error.contentType,
        error: error.reason,
      );
    } catch (error) {
      debugPrint(
        '[conversation-features] load failed\n'
        'source=$_conversationFeaturePath\n'
        'status=\n'
        'contentType=\n'
        'reason=$error\n'
        'fallback=all disabled',
      );
      return ConversationFeatureFlags.disabled(
        source: _conversationFeaturePath,
        error: error.toString(),
      );
    }
  }

  Future<Map<String, dynamic>> shareConversation(String conversationId) async {
    if (mockMode) {
      throw const ApiException('分享接口未部署', statusCode: 404);
    }
    final data = await _requestConversationAction(
      action: 'share',
      method: 'POST',
      path: _conversationActionPath(conversationId, 'share'),
      conversationId: conversationId,
      forbiddenMessage: '无权限分享该会话',
      notFoundMessage: '分享接口未部署',
      methodNotAllowedMessage: '分享接口未接入',
      timeoutMessage: '分享请求超时，请稍后重试',
      invalidJsonMessage: '分享接口返回异常',
    );
    final link = _firstConversationActionUrl(data, const [
      'shareUrl',
      'share_url',
      'shareLink',
      'share_link',
      'link',
      'url',
    ]);
    debugPrint(
      '[conversation-action] share parsed link exists=${link.isNotEmpty}',
    );
    return data;
  }

  Future<Map<String, dynamic>> startConversationGroupChat(
    String conversationId,
  ) async {
    if (mockMode) {
      throw const ApiException('群聊接口未部署', statusCode: 404);
    }
    final data = await _requestConversationAction(
      action: 'group-chat',
      method: 'POST',
      path: _conversationActionPath(conversationId, 'group-chat'),
      conversationId: conversationId,
      forbiddenMessage: '无权限创建群聊',
      notFoundMessage: '群聊接口未部署',
      methodNotAllowedMessage: '群聊接口未接入',
      timeoutMessage: '创建群聊链接超时，请稍后重试',
      invalidJsonMessage: '群聊接口返回异常',
    );
    final inviteUrl = _firstConversationActionUrl(data, const [
      'inviteUrl',
      'invite_url',
      'inviteLink',
      'invite_link',
      'groupLink',
      'group_link',
      'groupChatLink',
      'group_chat_link',
      'shareUrl',
      'share_url',
      'link',
      'url',
      'joinUrl',
      'join_url',
      'joinLink',
      'join_link',
    ]);
    debugPrint(
      '[conversation-action] group-chat parsed inviteUrl '
      'exists=${inviteUrl.isNotEmpty}',
    );
    return data;
  }

  Future<Map<String, dynamic>> resetConversationGroupChatLink(
    String conversationId,
  ) async {
    if (mockMode) {
      throw const ApiException('重置链接接口未接入', statusCode: 404);
    }

    try {
      final data = await _requestConversationAction(
        action: 'group-chat reset-link',
        method: 'POST',
        path: _conversationActionPath(conversationId, 'group-chat/reset-link'),
        conversationId: conversationId,
        notFoundMessage: '重置链接接口未接入',
        methodNotAllowedMessage: '重置链接接口未接入',
      );
      debugPrint('[conversation-action] group-chat reset-link success');
      return data;
    } on ApiException catch (firstError) {
      if (!_isMissingConversationActionEndpoint(firstError)) {
        debugPrint(
          '[conversation-action] group-chat reset-link failed '
          'status=${firstError.statusCode ?? ''} reason=${firstError.message}',
        );
        rethrow;
      }
    }

    try {
      final data = await _requestConversationAction(
        action: 'group-chat reset-link',
        method: 'PATCH',
        path: _conversationActionPath(conversationId, 'group-chat/link'),
        conversationId: conversationId,
        notFoundMessage: '重置链接接口未接入',
        methodNotAllowedMessage: '重置链接接口未接入',
      );
      debugPrint('[conversation-action] group-chat reset-link success');
      return data;
    } on ApiException catch (error) {
      final message = _isMissingConversationActionEndpoint(error)
          ? '重置链接接口未接入'
          : error.message;
      debugPrint(
        '[conversation-action] group-chat reset-link failed '
        'status=${error.statusCode ?? ''} reason=$message',
      );
      throw ApiException(message, statusCode: error.statusCode);
    }
  }

  Future<void> deleteConversationGroupChatLink(String conversationId) async {
    if (mockMode) {
      throw const ApiException('删除链接接口未接入', statusCode: 404);
    }

    try {
      await _requestConversationAction(
        action: 'group-chat delete-link',
        method: 'DELETE',
        path: _conversationActionPath(conversationId, 'group-chat/link'),
        conversationId: conversationId,
        notFoundMessage: '删除链接接口未接入',
        methodNotAllowedMessage: '删除链接接口未接入',
      );
      debugPrint('[conversation-action] group-chat delete-link success');
      return;
    } on ApiException catch (firstError) {
      if (!_isMissingConversationActionEndpoint(firstError)) {
        debugPrint(
          '[conversation-action] group-chat delete-link failed '
          'status=${firstError.statusCode ?? ''} reason=${firstError.message}',
        );
        rethrow;
      }
    }

    try {
      await _requestConversationAction(
        action: 'group-chat delete-link',
        method: 'DELETE',
        path: _conversationActionPath(conversationId, 'group-chat'),
        conversationId: conversationId,
        notFoundMessage: '删除链接接口未接入',
        methodNotAllowedMessage: '删除链接接口未接入',
      );
      debugPrint('[conversation-action] group-chat delete-link success');
    } on ApiException catch (error) {
      final message = _isMissingConversationActionEndpoint(error)
          ? '删除链接接口未接入'
          : error.message;
      debugPrint(
        '[conversation-action] group-chat delete-link failed '
        'status=${error.statusCode ?? ''} reason=$message',
      );
      throw ApiException(message, statusCode: error.statusCode);
    }
  }

  Future<Map<String, dynamic>> renameConversation({
    required String conversationId,
    required String title,
  }) {
    if (mockMode) {
      throw const ApiException('操作接口未部署', statusCode: 404);
    }
    return _requestConversationAction(
      action: 'rename',
      method: 'PATCH',
      path: _conversationActionPath(conversationId, 'rename'),
      conversationId: conversationId,
      body: {'title': title},
    );
  }

  Future<Map<String, dynamic>> archiveConversation(String conversationId) {
    if (mockMode) {
      throw const ApiException('操作接口未部署', statusCode: 404);
    }
    return _requestConversationAction(
      action: 'archive',
      method: 'PATCH',
      path: _conversationActionPath(conversationId, 'archive'),
      conversationId: conversationId,
    );
  }

  Future<Map<String, dynamic>> deleteConversation(String conversationId) {
    if (mockMode) {
      throw const ApiException('操作接口未部署', statusCode: 404);
    }
    return _requestConversationAction(
      action: 'delete',
      method: 'DELETE',
      path: '/api/user/conversations/${Uri.encodeComponent(conversationId)}',
      conversationId: conversationId,
    );
  }

  ConversationFeatureFlags _conversationFeatureFlagsFrom(
    Map<String, dynamic> data, {
    required String source,
    required int statusCode,
    required String contentType,
  }) {
    final values = parseConversationFeatureValues(data);

    final message = conversationFeatureMessage(data);
    return ConversationFeatureFlags(
      values: values,
      loaded: true,
      message: message.isEmpty ? '该功能暂未开放，请联系管理员开启。' : message,
      source: source,
      statusCode: statusCode,
      contentType: contentType,
    );
  }

  void _debugConversationFeatureFlags(ConversationFeatureFlags flags) {
    debugPrint(
      '[conversation-features] parsed '
      'share=${flags.isEnabled(ConversationFeatureKeys.share)} '
      'groupChat=${flags.isEnabled(ConversationFeatureKeys.groupChat)} '
      'rename=${flags.isEnabled(ConversationFeatureKeys.rename)} '
      'archive=${flags.isEnabled(ConversationFeatureKeys.archive)} '
      'delete=${flags.isEnabled(ConversationFeatureKeys.delete)} '
      'pinCloudSync=${flags.isEnabled(ConversationFeatureKeys.pinCloudSync)} '
      'source=${flags.source}',
    );
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
        'licenseActivated': false,
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
        'licenseActivated': false,
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
      throw const ApiException('卡密验证服务未接入，请联系超级管理员');
    }

    return _postJson('/api/license/redeem', {
      'licenseKey': licenseKey,
    });
  }

  Future<LicenseStatusResult> licenseStatus({
    Map<String, dynamic>? authData,
  }) async {
    if (mockMode) {
      return const LicenseStatusResult(
        status: LicenseStatus.serviceUnavailable,
        message: '卡密验证服务未接入，请联系超级管理员',
      );
    }

    final authStatus = _licenseStatusFromEnvelope(authData);
    if (authStatus.status != LicenseStatus.unknown) {
      return authStatus;
    }

    try {
      final userData = await currentUser();
      final userStatus = _licenseStatusFromEnvelope(userData);
      if (userStatus.status != LicenseStatus.unknown) {
        return userStatus;
      }
      return LicenseStatusResult(
        status: LicenseStatus.unknown,
        message: _licenseMessageFromData(userData) ?? '请先完成卡密激活',
        raw: userData,
      );
    } on ApiException catch (error) {
      return _licenseStatusFromError(error);
    } catch (error) {
      return LicenseStatusResult(
        status: LicenseStatus.serviceUnavailable,
        message: '卡密验证服务未接入，请联系超级管理员',
        raw: {'error': error.toString()},
      );
    }
  }

  Future<LicenseStatusResult> activateLicense(String licenseKey) async {
    final normalizedKey = licenseKey.trim();
    if (normalizedKey.isEmpty) {
      return const LicenseStatusResult(
        status: LicenseStatus.invalid,
        message: '请输入卡密',
      );
    }

    if (mockMode) {
      return const LicenseStatusResult(
        status: LicenseStatus.serviceUnavailable,
        message: '卡密验证服务未接入，请联系超级管理员',
      );
    }

    try {
      final data = await redeemLicense(normalizedKey);
      final status = _licenseStatusFromEnvelope(data);
      if (status.status != LicenseStatus.unknown) {
        return status;
      }
      return LicenseStatusResult(
        status: LicenseStatus.serviceUnavailable,
        message: '卡密验证服务未接入，请联系超级管理员',
        raw: data,
      );
    } on ApiException catch (error) {
      return _licenseStatusFromError(error);
    } catch (error) {
      return LicenseStatusResult(
        status: LicenseStatus.serviceUnavailable,
        message: '卡密验证服务未接入，请联系超级管理员',
        raw: {'error': error.toString()},
      );
    }
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

  LicenseStatusResult _licenseStatusFromEnvelope(Map<String, dynamic>? data) {
    if (data == null || data.isEmpty) {
      return const LicenseStatusResult(
        status: LicenseStatus.unknown,
        message: '请先完成卡密激活',
      );
    }

    final message = _licenseMessageFromData(data) ?? '请先完成卡密激活';
    final status = _readLicenseStatus(data);
    if (status == LicenseStatus.unknown) {
      return LicenseStatusResult(status: status, message: message, raw: data);
    }
    return LicenseStatusResult(
      status: status,
      message: _messageForLicenseStatus(status, fallback: message),
      raw: data,
    );
  }

  LicenseStatus _readLicenseStatus(Map<String, dynamic> data) {
    for (final key in const [
      'licenseActivated',
      'license_activated',
      'activationActivated',
      'activation_activated',
      'cardActivated',
      'card_activated',
      'isLicenseActive',
      'is_license_active',
      'isActivated',
      'is_activated',
    ]) {
      final value = data[key];
      if (value is bool) {
        return value ? LicenseStatus.active : LicenseStatus.inactive;
      }
    }

    for (final key in const [
      'licenseStatus',
      'license_status',
      'activationStatus',
      'activation_status',
      'cardStatus',
      'card_status',
      'licenseState',
      'license_state',
      'activationState',
      'activation_state',
    ]) {
      final status = _licenseStatusFromValue(data[key]);
      if (status != LicenseStatus.unknown) {
        return status;
      }
    }

    for (final key in const ['license', 'activation', 'card', 'subscription']) {
      final nested = _asMap(data[key]);
      if (nested.isEmpty) {
        continue;
      }
      final status = _readLicenseStatus(nested);
      if (status != LicenseStatus.unknown) {
        return status;
      }
      final nestedStatus = _licenseStatusFromValue(nested['status']);
      if (nestedStatus != LicenseStatus.unknown) {
        return nestedStatus;
      }
    }

    for (final key in const ['user', 'profile', 'data']) {
      final nested = _asMap(data[key]);
      if (nested.isEmpty || identical(nested, data)) {
        continue;
      }
      final status = _readLicenseStatus(nested);
      if (status != LicenseStatus.unknown) {
        return status;
      }
    }

    return LicenseStatus.unknown;
  }

  LicenseStatus _licenseStatusFromValue(Object? value) {
    if (value is bool) {
      return value ? LicenseStatus.active : LicenseStatus.inactive;
    }
    final text = value?.toString().trim().toLowerCase() ?? '';
    if (text.isEmpty) {
      return LicenseStatus.unknown;
    }
    final normalized = text.replaceAll(RegExp(r'[\s_-]+'), '');

    if (normalized.contains('expired') || normalized.contains('过期')) {
      return LicenseStatus.expired;
    }
    if (normalized.contains('disabled') ||
        normalized.contains('banned') ||
        normalized.contains('suspended') ||
        normalized.contains('禁用') ||
        normalized.contains('停用')) {
      return LicenseStatus.disabled;
    }
    if (normalized.contains('used') ||
        normalized.contains('redeemed') ||
        normalized.contains('bound') ||
        normalized.contains('已使用') ||
        normalized.contains('已绑定')) {
      return LicenseStatus.used;
    }
    if (normalized.contains('invalid') ||
        normalized.contains('notfound') ||
        normalized.contains('notexist') ||
        normalized.contains('无效') ||
        normalized.contains('不存在')) {
      return LicenseStatus.invalid;
    }
    if (normalized.contains('unavailable') ||
        normalized.contains('notimplemented') ||
        normalized.contains('未接入')) {
      return LicenseStatus.serviceUnavailable;
    }
    if (normalized.contains('inactive') ||
        normalized.contains('unactivated') ||
        normalized.contains('pending') ||
        normalized.contains('required') ||
        normalized.contains('未激活') ||
        normalized.contains('待激活')) {
      return LicenseStatus.inactive;
    }
    if (normalized.contains('active') ||
        normalized.contains('activated') ||
        normalized.contains('valid') ||
        normalized.contains('已激活') ||
        normalized.contains('有效')) {
      return LicenseStatus.active;
    }

    return LicenseStatus.unknown;
  }

  LicenseStatusResult _licenseStatusFromError(ApiException error) {
    final status = _licenseStatusFromValue(error.message);
    if (status != LicenseStatus.unknown) {
      return LicenseStatusResult(
        status: status,
        message: _messageForLicenseStatus(status, fallback: error.message),
        raw: {
          'message': error.message,
          if (error.statusCode != null) 'statusCode': error.statusCode,
          if (error.debugDetails != null) 'debugDetails': error.debugDetails,
        },
      );
    }

    final mappedStatus = switch (error.statusCode) {
      400 => LicenseStatus.invalid,
      401 => LicenseStatus.inactive,
      403 => LicenseStatus.disabled,
      404 => LicenseStatus.serviceUnavailable,
      409 => LicenseStatus.used,
      410 => LicenseStatus.expired,
      501 || 503 => LicenseStatus.serviceUnavailable,
      _ => LicenseStatus.serviceUnavailable,
    };
    return LicenseStatusResult(
      status: mappedStatus,
      message: _messageForLicenseStatus(mappedStatus, fallback: error.message),
      raw: {
        'message': error.message,
        if (error.statusCode != null) 'statusCode': error.statusCode,
        if (error.debugDetails != null) 'debugDetails': error.debugDetails,
      },
    );
  }

  String? _licenseMessageFromData(Map<String, dynamic> data) {
    for (final key in const ['message', 'reason', 'error', 'detail']) {
      final value = data[key];
      if (value is String && value.trim().isNotEmpty) {
        return value.trim();
      }
      if (value is Map) {
        final nested = _licenseMessageFromData(
          value.map((key, item) => MapEntry(key?.toString() ?? '', item)),
        );
        if (nested != null) {
          return nested;
        }
      }
    }

    for (final key in const ['license', 'activation', 'card', 'user', 'data']) {
      final value = data[key];
      if (value is Map) {
        final nested = _licenseMessageFromData(
          value.map((key, item) => MapEntry(key?.toString() ?? '', item)),
        );
        if (nested != null) {
          return nested;
        }
      }
    }
    return null;
  }

  String _messageForLicenseStatus(
    LicenseStatus status, {
    required String fallback,
  }) {
    return switch (status) {
      LicenseStatus.active => '激活成功',
      LicenseStatus.inactive => '请先完成卡密激活',
      LicenseStatus.expired => '卡密已过期',
      LicenseStatus.disabled => '卡密已禁用',
      LicenseStatus.invalid => '卡密无效',
      LicenseStatus.used => '卡密已使用',
      LicenseStatus.serviceUnavailable => '卡密验证服务未接入，请联系超级管理员',
      LicenseStatus.checking => '正在验证卡密...',
      LicenseStatus.unknown => fallback,
    };
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
